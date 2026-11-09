"""
Database abstraction layer — Supabase (PostgreSQL via psycopg2).

This is the ONLY file that imports or calls the database.
All routers call helper functions defined here.
"""

import threading
import time
from contextlib import contextmanager
from datetime import date, datetime

import psycopg2
import psycopg2.extras
import psycopg2.pool

from config import DATABASE_URL, DB_POOL_MAX, DB_POOL_MIN

# ---------------------------------------------------------------------------
# Connection pool — FastAPI runs sync route handlers in a thread pool, so
# many requests can be in flight concurrently. A single shared connection
# can't safely handle overlapping queries from different threads (libpq only
# allows one command in flight per connection), so each request borrows its
# own connection from a small pool and returns it when done.
#
# DB_POOL_MIN/DB_POOL_MAX (env-configurable, defaults 5/45): Render's free
# tier runs a single instance, and Starlette's threadpool for sync route
# handlers caps at 40 concurrent threads by default, so the max should stay
# >= 40 to keep DatabaseBusyError practically unreachable. The real ceiling
# here is Supabase's pooler (Supavisor) client-connection limit in
# transaction mode, not a fixed count of direct Postgres connections.
#
# Created lazily (on first actual DB access), not at import time — so this
# module can be imported, and its pure helpers (like the cache below) unit
# tested, without a reachable database.
#
# psycopg2.pool.ThreadedConnectionPool closes a connection on putconn()
# once it already has >= minconn idle, so with minconn=1 almost every
# borrow under load had to open a fresh TLS connection. A higher minconn
# keeps that many connections warm. TCP keepalives detect a connection
# Supavisor or the network has silently dropped (instead of handing out a
# dead one and finding out mid-query); _checkout_connection additionally
# discards and replaces a connection that's been idle longer than
# _MAX_IDLE_SECONDS, since Supavisor can recycle idle backends on its own
# schedule regardless of what psycopg2 thinks the connection's state is.
# ---------------------------------------------------------------------------

_MAX_IDLE_SECONDS = 300  # 5 minutes


class _TrackedConnection(psycopg2.extensions.connection):
    """A plain psycopg2 connection plus a last-used timestamp, so the pool
    can recycle connections that have sat idle too long."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.last_used = time.monotonic()


_pool: psycopg2.pool.ThreadedConnectionPool | None = None
_pool_init_lock = threading.Lock()


def _get_pool() -> psycopg2.pool.ThreadedConnectionPool:
    global _pool
    if _pool is not None:
        return _pool
    with _pool_init_lock:
        if _pool is None:
            _pool = psycopg2.pool.ThreadedConnectionPool(
                DB_POOL_MIN, DB_POOL_MAX, DATABASE_URL,
                connection_factory=_TrackedConnection,
                keepalives=1,
                keepalives_idle=30,
                keepalives_interval=10,
                keepalives_count=3,
            )
        return _pool


class DatabaseBusyError(Exception):
    """Raised when the connection pool has no connections left to hand out."""


class ScoreVersionConflict(Exception):
    """Raised when upsert_score's expected_version doesn't match the current row."""

    def __init__(self, current_row: dict):
        self.current_row = current_row
        super().__init__("Score was modified by another user")


def _checkout_connection(pool: psycopg2.pool.ThreadedConnectionPool) -> _TrackedConnection:
    try:
        conn = pool.getconn()
    except psycopg2.pool.PoolError as exc:
        raise DatabaseBusyError() from exc

    if conn.closed or (time.monotonic() - conn.last_used) > _MAX_IDLE_SECONDS:
        pool.putconn(conn, close=True)
        try:
            conn = pool.getconn()
        except psycopg2.pool.PoolError as exc:
            raise DatabaseBusyError() from exc

    return conn


@contextmanager
def _cursor():
    pool = _get_pool()
    conn = _checkout_connection(pool)
    conn.autocommit = True
    ok = False
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            yield cur
        ok = True
    finally:
        if ok:
            conn.last_used = time.monotonic()
        # Discard (rather than return) a connection that errored — it may be
        # in a broken state. The pool lazily opens a fresh one on next use.
        pool.putconn(conn, close=not ok)


def _with_read_retry(query_fn):
    """Run a read-only query function, retrying once with a fresh connection
    if the pooled connection turned out to be dead or broken.

    Never wrap a write with this: if the connection died after a write was
    sent but before its result came back, the commit state is unknown, and
    retrying could double-apply it (e.g. double-increment a score's
    version). Writes are left to surface the error; the frontend's own
    retry (Phase 3.1) handles it from there.
    """
    try:
        return query_fn()
    except (psycopg2.OperationalError, psycopg2.InterfaceError):
        return query_fn()


# ---------------------------------------------------------------------------
# Type coercion
# psycopg2 returns Python date/datetime objects for DATE/TIMESTAMPTZ columns.
# All routers and Pydantic models expect plain strings, so we normalise every
# returned row here. Callers never see Python date/datetime objects.
# ---------------------------------------------------------------------------

def _coerce(row) -> dict:
    """Convert date/datetime → ISO string; None → ''. Returns a plain dict."""
    out = {}
    for k, v in dict(row).items():
        if isinstance(v, datetime):
            out[k] = v.isoformat()
        elif isinstance(v, date):
            out[k] = v.isoformat()   # "YYYY-MM-DD"
        elif v is None:
            out[k] = ""
        else:
            out[k] = v
    return out


def _coerce_rows(rows) -> list[dict]:
    return [_coerce(r) for r in rows]


# ---------------------------------------------------------------------------
# In-memory TTL cache — reduces DB round-trips during active tournaments.
# Writes call _invalidate() so the next read always fetches fresh data.
#
# Correctness under concurrency:
#   - Single-flight: a per-key lock means only one thread refetches a given
#     key at a time; others reuse whatever it fetches instead of each
#     issuing their own identical query (avoids a "cache miss stampede"
#     when many requests land at once, e.g. everyone checking the
#     leaderboard right after a score is submitted).
#   - Generation counter: each key has a generation, bumped by every
#     _invalidate() call. A fetch records the generation *before* querying
#     and only stores its result if the generation is still the same
#     afterwards. Without this, a slow fetch that started just before a
#     write could finish after the write and overwrite the cache with
#     stale pre-write data for the rest of the TTL.
# ---------------------------------------------------------------------------

_CACHE_TTL: dict[str, int] = {
    "registrations":     30,
    "handicap_requests": 30,
    "tournaments":       60,
    "score_audit_log":   60,
    "users":            120,
    "rounds":           120,
    "courses":          120,
    "holes":            120,
    "pars":             120,
    "handicaps":        120,
}

_cache: dict[str, dict] = {}
_cache_generations: dict[str, int] = {}
_cache_locks: dict[str, threading.Lock] = {}
_cache_locks_guard = threading.Lock()


def _lock_for(key: str) -> threading.Lock:
    """Lazily create (and remember) one lock per cache key."""
    lock = _cache_locks.get(key)
    if lock is not None:
        return lock
    with _cache_locks_guard:
        lock = _cache_locks.setdefault(key, threading.Lock())
    return lock


def _get_cached(table: str, query_fn) -> list[dict]:
    entry = _cache.get(table)
    if entry and (time.monotonic() - entry["ts"]) < _CACHE_TTL[table]:
        return entry["data"]
    with _lock_for(table):
        entry = _cache.get(table)
        if entry and (time.monotonic() - entry["ts"]) < _CACHE_TTL[table]:
            return entry["data"]
        generation = _cache_generations.get(table, 0)
        fresh = query_fn()
        if _cache_generations.get(table, 0) == generation:
            _cache[table] = {"data": fresh, "ts": time.monotonic()}
        return fresh


def _invalidate(table: str) -> None:
    _cache_generations[table] = _cache_generations.get(table, 0) + 1
    _cache.pop(table, None)


# ---------------------------------------------------------------------------
# Scores cache — scoped by query (tournament/round/registration), not one
# cache entry for the whole table. A short TTL because scores change
# constantly during an active round; invalidating every scoped key on any
# write is simplest and acceptable now that each entry is small (a single
# tournament or round's scores, not every score ever played).
#
# Invalidation is coarse (every scoped key at once) and a write doesn't know
# in advance every key that might be mid-fetch for the data it just changed
# (e.g. a key for a tournament_id that's never been queried before isn't in
# _scores_cache yet, so there'd be nothing there to bump). A single *global*
# generation counter for the whole scores cache sidesteps that: every
# in-flight fetch, for any key, compares against the same counter, so any
# invalidation — regardless of which key triggered it — is visible to all
# of them.
# ---------------------------------------------------------------------------

_SCORES_CACHE_TTL = 8
_scores_cache: dict[str, dict] = {}
_scores_cache_generation = 0
_scores_cache_guard = threading.Lock()


def _get_scores_cached(key: str, query_fn) -> list[dict]:
    entry = _scores_cache.get(key)
    if entry and (time.monotonic() - entry["ts"]) < _SCORES_CACHE_TTL:
        return entry["data"]
    with _lock_for(key):
        entry = _scores_cache.get(key)
        if entry and (time.monotonic() - entry["ts"]) < _SCORES_CACHE_TTL:
            return entry["data"]
        generation = _scores_cache_generation
        fresh = query_fn()
        with _scores_cache_guard:
            if _scores_cache_generation == generation:
                _scores_cache[key] = {"data": fresh, "ts": time.monotonic()}
        return fresh


def _invalidate_scores_cache() -> None:
    global _scores_cache_generation
    with _scores_cache_guard:
        _scores_cache_generation += 1
        _scores_cache.clear()


# ---------------------------------------------------------------------------
# Generic helpers
# ---------------------------------------------------------------------------

def _build_set(updates: dict) -> tuple[str, list]:
    """Build a SQL SET clause from a dict. Keys must be trusted column names."""
    clause = ", ".join(f"{k} = %s" for k in updates)
    return clause, list(updates.values())


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

def get_all_users() -> list[dict]:
    def _fetch():
        with _cursor() as cur:
            cur.execute("SELECT * FROM users ORDER BY created_at")
            return _coerce_rows(cur.fetchall())
    return _get_cached("users", lambda: _with_read_retry(_fetch))


def get_user_by_email(email: str) -> dict | None:
    def _query():
        with _cursor() as cur:
            cur.execute("SELECT * FROM users WHERE email = %s", (email,))
            row = cur.fetchone()
            return _coerce(row) if row else None
    return _with_read_retry(_query)


def get_user_by_id(user_id: str) -> dict | None:
    def _query():
        with _cursor() as cur:
            cur.execute("SELECT * FROM users WHERE user_id = %s", (user_id,))
            row = cur.fetchone()
            return _coerce(row) if row else None
    return _with_read_retry(_query)


def get_user_by_invite_token(token: str) -> dict | None:
    def _query():
        with _cursor() as cur:
            cur.execute("SELECT * FROM users WHERE invite_token = %s", (token,))
            row = cur.fetchone()
            return _coerce(row) if row else None
    return _with_read_retry(_query)


def insert_user(row: dict) -> None:
    with _cursor() as cur:
        cur.execute(
            """
            INSERT INTO users
                (user_id, first_name, last_name, email, phone,
                 password_hash, invite_token, role, status, created_at, invited_by)
            VALUES
                (%(user_id)s, %(first_name)s, %(last_name)s, %(email)s, %(phone)s,
                 %(password_hash)s, %(invite_token)s, %(role)s, %(status)s, %(created_at)s,
                 %(invited_by)s)
            """,
            row,
        )
    _invalidate("users")


def delete_user(user_id: str) -> None:
    with _cursor() as cur:
        cur.execute("DELETE FROM users WHERE user_id = %s", (user_id,))
    _invalidate("users")


def update_user(user_id: str, updates: dict) -> None:
    clause, vals = _build_set(updates)
    with _cursor() as cur:
        cur.execute(f"UPDATE users SET {clause} WHERE user_id = %s", vals + [user_id])
    _invalidate("users")


# ---------------------------------------------------------------------------
# Courses
# ---------------------------------------------------------------------------

def get_all_courses() -> list[dict]:
    def _fetch():
        with _cursor() as cur:
            cur.execute("SELECT * FROM courses ORDER BY name")
            return _coerce_rows(cur.fetchall())
    return _get_cached("courses", lambda: _with_read_retry(_fetch))


def get_course_by_id(course_id: str) -> dict | None:
    return next((c for c in get_all_courses() if c["course_id"] == course_id), None)


def insert_course(row: dict) -> None:
    with _cursor() as cur:
        cur.execute(
            """
            INSERT INTO courses (course_id, name, address, description)
            VALUES (%(course_id)s, %(name)s, %(address)s, %(description)s)
            """,
            row,
        )
    _invalidate("courses")


def update_course(course_id: str, updates: dict) -> None:
    clause, vals = _build_set(updates)
    with _cursor() as cur:
        cur.execute(f"UPDATE courses SET {clause} WHERE course_id = %s", vals + [course_id])
    _invalidate("courses")


def delete_course(course_id: str) -> None:
    with _cursor() as cur:
        cur.execute("DELETE FROM courses WHERE course_id = %s", (course_id,))
    _invalidate("courses")


# ---------------------------------------------------------------------------
# Holes
# ---------------------------------------------------------------------------

def get_all_holes() -> list[dict]:
    def _fetch():
        with _cursor() as cur:
            cur.execute("SELECT * FROM holes ORDER BY course_id, hole_number")
            return _coerce_rows(cur.fetchall())
    return _get_cached("holes", lambda: _with_read_retry(_fetch))


def get_holes_by_course(course_id: str) -> list[dict]:
    return [h for h in get_all_holes() if h["course_id"] == course_id]


def insert_hole(row: dict) -> None:
    with _cursor() as cur:
        cur.execute(
            "INSERT INTO holes (hole_id, course_id, hole_number) VALUES (%(hole_id)s, %(course_id)s, %(hole_number)s)",
            row,
        )
    _invalidate("holes")


def update_hole(hole_id: str, updates: dict) -> None:
    clause, vals = _build_set(updates)
    with _cursor() as cur:
        cur.execute(f"UPDATE holes SET {clause} WHERE hole_id = %s", vals + [hole_id])
    _invalidate("holes")


def delete_hole(hole_id: str) -> None:
    with _cursor() as cur:
        cur.execute("DELETE FROM holes WHERE hole_id = %s", (hole_id,))
    _invalidate("holes")


# ---------------------------------------------------------------------------
# Pars  (SCD)
# ---------------------------------------------------------------------------

def get_all_pars() -> list[dict]:
    def _fetch():
        with _cursor() as cur:
            cur.execute("SELECT * FROM pars ORDER BY hole_id, active_from")
            return _coerce_rows(cur.fetchall())
    return _get_cached("pars", lambda: _with_read_retry(_fetch))


def get_pars_for_date(tournament_start_date: str) -> list[dict]:
    """Return pars active on tournament_start_date (SCD lookup)."""
    def _query():
        with _cursor() as cur:
            cur.execute(
                """
                SELECT * FROM pars
                WHERE active_from <= %s::date AND active_to >= %s::date
                """,
                (tournament_start_date, tournament_start_date),
            )
            return _coerce_rows(cur.fetchall())
    return _with_read_retry(_query)


def insert_par(row: dict) -> None:
    with _cursor() as cur:
        cur.execute(
            """
            INSERT INTO pars (par_id, hole_id, par_strokes, active_from, active_to)
            VALUES (%(par_id)s, %(hole_id)s, %(par_strokes)s, %(active_from)s, %(active_to)s)
            """,
            row,
        )
    _invalidate("pars")


def close_par(par_id: str, active_to: str) -> None:
    with _cursor() as cur:
        cur.execute("UPDATE pars SET active_to = %s::date WHERE par_id = %s", (active_to, par_id))
    _invalidate("pars")


# ---------------------------------------------------------------------------
# Handicaps  (SCD)
# ---------------------------------------------------------------------------

def get_all_handicaps() -> list[dict]:
    def _fetch():
        with _cursor() as cur:
            cur.execute("SELECT * FROM handicaps ORDER BY user_id, active_from")
            return _coerce_rows(cur.fetchall())
    return _get_cached("handicaps", lambda: _with_read_retry(_fetch))


def get_handicap_for_user_date(user_id: str, tournament_start_date: str) -> dict | None:
    def _query():
        with _cursor() as cur:
            cur.execute(
                """
                SELECT * FROM handicaps
                WHERE user_id = %s
                  AND active_from <= %s::date
                  AND active_to   >= %s::date
                LIMIT 1
                """,
                (user_id, tournament_start_date, tournament_start_date),
            )
            row = cur.fetchone()
            return _coerce(row) if row else None
    return _with_read_retry(_query)


def insert_handicap(row: dict) -> None:
    with _cursor() as cur:
        cur.execute(
            """
            INSERT INTO handicaps (handicap_id, user_id, strokes, active_from, active_to)
            VALUES (%(handicap_id)s, %(user_id)s, %(strokes)s, %(active_from)s, %(active_to)s)
            """,
            row,
        )
    _invalidate("handicaps")


def close_handicap(handicap_id: str, active_to: str) -> None:
    with _cursor() as cur:
        cur.execute(
            "UPDATE handicaps SET active_to = %s::date WHERE handicap_id = %s",
            (active_to, handicap_id),
        )
    _invalidate("handicaps")


# ---------------------------------------------------------------------------
# Tournaments
# ---------------------------------------------------------------------------

def get_all_tournaments() -> list[dict]:
    def _fetch():
        with _cursor() as cur:
            cur.execute("SELECT * FROM tournaments ORDER BY start_date DESC")
            return _coerce_rows(cur.fetchall())
    return _get_cached("tournaments", lambda: _with_read_retry(_fetch))


def get_tournament_by_id(tournament_id: str) -> dict | None:
    return next((t for t in get_all_tournaments() if t["tournament_id"] == tournament_id), None)


def insert_tournament(row: dict) -> None:
    with _cursor() as cur:
        cur.execute(
            """
            INSERT INTO tournaments
                (tournament_id, name, start_date, end_date, tournament_admin_id,
                 entry_fee, max_players, registration_deadline)
            VALUES
                (%(tournament_id)s, %(name)s, %(start_date)s, %(end_date)s, %(tournament_admin_id)s,
                 %(entry_fee)s, %(max_players)s, %(registration_deadline)s)
            """,
            row,
        )
    _invalidate("tournaments")


def update_tournament(tournament_id: str, updates: dict) -> None:
    clause, vals = _build_set(updates)
    with _cursor() as cur:
        cur.execute(
            f"UPDATE tournaments SET {clause} WHERE tournament_id = %s",
            vals + [tournament_id],
        )
    _invalidate("tournaments")


# ---------------------------------------------------------------------------
# Rounds
# ---------------------------------------------------------------------------

def get_all_rounds() -> list[dict]:
    def _fetch():
        with _cursor() as cur:
            cur.execute("SELECT * FROM rounds ORDER BY tournament_id, round_number")
            return _coerce_rows(cur.fetchall())
    return _get_cached("rounds", lambda: _with_read_retry(_fetch))


def get_rounds_by_tournament(tournament_id: str) -> list[dict]:
    return [r for r in get_all_rounds() if r["tournament_id"] == tournament_id]


def get_round_by_id(round_id: str) -> dict | None:
    return next((r for r in get_all_rounds() if r["round_id"] == round_id), None)


def insert_round(row: dict) -> None:
    with _cursor() as cur:
        cur.execute(
            """
            INSERT INTO rounds (round_id, tournament_id, course_id, round_number, label)
            VALUES (%(round_id)s, %(tournament_id)s, %(course_id)s, %(round_number)s, %(label)s)
            """,
            row,
        )
    _invalidate("rounds")


def update_round(round_id: str, updates: dict) -> None:
    clause, vals = _build_set(updates)
    with _cursor() as cur:
        cur.execute(f"UPDATE rounds SET {clause} WHERE round_id = %s", vals + [round_id])
    _invalidate("rounds")


def delete_round(round_id: str) -> None:
    with _cursor() as cur:
        cur.execute("DELETE FROM rounds WHERE round_id = %s", (round_id,))
    _invalidate("rounds")


# ---------------------------------------------------------------------------
# Registrations
# ---------------------------------------------------------------------------

def get_all_registrations() -> list[dict]:
    def _fetch():
        with _cursor() as cur:
            cur.execute("SELECT * FROM registrations ORDER BY submitted_at DESC")
            return _coerce_rows(cur.fetchall())
    return _get_cached("registrations", lambda: _with_read_retry(_fetch))


def get_registrations_by_tournament(tournament_id: str) -> list[dict]:
    return [r for r in get_all_registrations() if r["tournament_id"] == tournament_id]


def get_registrations_by_user(user_id: str) -> list[dict]:
    return [r for r in get_all_registrations() if r["user_id"] == user_id]


def get_registration_by_id(registration_id: str) -> dict | None:
    return next(
        (r for r in get_all_registrations() if r["registration_id"] == registration_id), None
    )


def insert_registration(row: dict) -> None:
    with _cursor() as cur:
        cur.execute(
            """
            INSERT INTO registrations (registration_id, tournament_id, user_id, status, submitted_at)
            VALUES (%(registration_id)s, %(tournament_id)s, %(user_id)s, %(status)s, %(submitted_at)s)
            """,
            row,
        )
    _invalidate("registrations")


def update_registration(registration_id: str, updates: dict) -> None:
    clause, vals = _build_set(updates)
    with _cursor() as cur:
        cur.execute(
            f"UPDATE registrations SET {clause} WHERE registration_id = %s",
            vals + [registration_id],
        )
    _invalidate("registrations")


# ---------------------------------------------------------------------------
# Scores
# ---------------------------------------------------------------------------

def get_all_scores() -> list[dict]:
    """Unscoped — every score ever played. Expensive; admin-only (enforced
    in the router). Prefer get_scores_by_tournament/_round/_registration."""
    def _fetch():
        with _cursor() as cur:
            cur.execute("SELECT * FROM scores ORDER BY submitted_at DESC")
            return _coerce_rows(cur.fetchall())
    return _get_scores_cached("scores:all", lambda: _with_read_retry(_fetch))


def get_scores_by_tournament(tournament_id: str) -> list[dict]:
    def _fetch():
        with _cursor() as cur:
            cur.execute(
                """
                SELECT s.* FROM scores s
                JOIN rounds r ON r.round_id = s.round_id
                WHERE r.tournament_id = %s
                ORDER BY s.submitted_at DESC
                """,
                (tournament_id,),
            )
            return _coerce_rows(cur.fetchall())
    return _get_scores_cached(f"scores:tournament:{tournament_id}", lambda: _with_read_retry(_fetch))


def get_scores_by_registration(registration_id: str) -> list[dict]:
    def _fetch():
        with _cursor() as cur:
            cur.execute(
                "SELECT * FROM scores WHERE registration_id = %s ORDER BY submitted_at DESC",
                (registration_id,),
            )
            return _coerce_rows(cur.fetchall())
    return _get_scores_cached(f"scores:registration:{registration_id}", lambda: _with_read_retry(_fetch))


def get_scores_by_round(round_id: str) -> list[dict]:
    def _fetch():
        with _cursor() as cur:
            cur.execute(
                "SELECT * FROM scores WHERE round_id = %s ORDER BY submitted_at DESC",
                (round_id,),
            )
            return _coerce_rows(cur.fetchall())
    return _get_scores_cached(f"scores:round:{round_id}", lambda: _with_read_retry(_fetch))


def get_score_by_id(score_id: str) -> dict | None:
    def _query():
        with _cursor() as cur:
            cur.execute("SELECT * FROM scores WHERE score_id = %s", (score_id,))
            row = cur.fetchone()
            return _coerce(row) if row else None
    return _with_read_retry(_query)


def insert_score(row: dict) -> None:
    with _cursor() as cur:
        cur.execute(
            """
            INSERT INTO scores
                (score_id, user_id, registration_id, round_id, hole_id,
                 strokes, submitted_at, last_modified_by, version)
            VALUES
                (%(score_id)s, %(user_id)s, %(registration_id)s, %(round_id)s, %(hole_id)s,
                 %(strokes)s, %(submitted_at)s, %(last_modified_by)s, %(version)s)
            """,
            row,
        )
    _invalidate_scores_cache()


def update_score(score_id: str, updates: dict) -> None:
    clause, vals = _build_set(updates)
    with _cursor() as cur:
        cur.execute(f"UPDATE scores SET {clause} WHERE score_id = %s", vals + [score_id])
    _invalidate_scores_cache()


_UPSERT_SCORE_SQL = """
    WITH prev AS (
        SELECT * FROM scores
        WHERE registration_id = %(registration_id)s
          AND round_id        = %(round_id)s
          AND hole_id         = %(hole_id)s
    ),
    upsert AS (
        INSERT INTO scores
            (score_id, user_id, registration_id, round_id, hole_id,
             strokes, submitted_at, last_modified_by, version)
        VALUES
            (%(score_id)s, %(user_id)s, %(registration_id)s, %(round_id)s, %(hole_id)s,
             %(strokes)s, %(submitted_at)s, %(last_modified_by)s, 1)
        ON CONFLICT (registration_id, round_id, hole_id) DO UPDATE
        SET
            strokes           = EXCLUDED.strokes,
            last_modified_by  = EXCLUDED.last_modified_by,
            submitted_at      = EXCLUDED.submitted_at,
            version           = scores.version + 1
        WHERE (%(expected_version)s IS NULL OR scores.version = %(expected_version)s)
        RETURNING *
    )
    SELECT
        (SELECT row_to_json(u) FROM upsert u) AS new_row,
        (SELECT row_to_json(p) FROM prev p)   AS prev_row
"""


def upsert_score(
    registration_id: str,
    round_id: str,
    hole_id: str,
    row: dict,
    expected_version: int | None = None,
) -> tuple[dict | None, dict]:
    """
    Insert or update a score identified by (registration_id, round_id, hole_id),
    checking expected_version atomically against the write in a single
    statement on a single connection (safe under Supavisor transaction mode —
    no session state, no server-side prepared statements).

    Returns (previous_row_or_None, new_row). The version is incremented on
    update. Raises ScoreVersionConflict if expected_version is given and
    doesn't match the row's current version — no write happens in that case.
    """
    params = {**row, "registration_id": registration_id, "round_id": round_id,
              "hole_id": hole_id, "expected_version": expected_version}
    with _cursor() as cur:
        cur.execute(_UPSERT_SCORE_SQL, params)
        result = cur.fetchone()

    new_row = result["new_row"]
    prev_row = result["prev_row"]

    if new_row is None:
        # The WHERE clause only skips the update when expected_version was
        # given and didn't match (when it's None, "IS NULL" makes the WHERE
        # always true). prev_row holds the current, unmodified row. Nothing
        # was written, so the cache doesn't need invalidating.
        raise ScoreVersionConflict(_coerce(prev_row) if prev_row else {})

    _invalidate_scores_cache()
    return (_coerce(prev_row) if prev_row else None), _coerce(new_row)


# ---------------------------------------------------------------------------
# Score Audit Log
# ---------------------------------------------------------------------------

def get_score_audit_logs_by_score(score_id: str) -> list[dict]:
    def _query():
        with _cursor() as cur:
            cur.execute(
                "SELECT * FROM score_audit_log WHERE score_id = %s ORDER BY modified_at",
                (score_id,),
            )
            return _coerce_rows(cur.fetchall())
    return _with_read_retry(_query)


def insert_score_audit_log(row: dict) -> None:
    with _cursor() as cur:
        cur.execute(
            """
            INSERT INTO score_audit_log
                (audit_id, score_id, previous_strokes, new_strokes, modified_by, modified_at)
            VALUES
                (%(audit_id)s, %(score_id)s, %(previous_strokes)s, %(new_strokes)s,
                 %(modified_by)s, %(modified_at)s)
            """,
            row,
        )


# ---------------------------------------------------------------------------
# Handicap Requests
# ---------------------------------------------------------------------------

def get_all_handicap_requests() -> list[dict]:
    def _fetch():
        with _cursor() as cur:
            cur.execute("SELECT * FROM handicap_requests ORDER BY submitted_at DESC")
            return _coerce_rows(cur.fetchall())
    return _get_cached("handicap_requests", lambda: _with_read_retry(_fetch))


def get_handicap_requests_by_user(user_id: str) -> list[dict]:
    return [r for r in get_all_handicap_requests() if r["user_id"] == user_id]


def insert_handicap_request(row: dict) -> None:
    with _cursor() as cur:
        cur.execute(
            """
            INSERT INTO handicap_requests
                (request_id, user_id, requested_strokes, message, status,
                 submitted_at, resolved_at, resolved_by)
            VALUES
                (%(request_id)s, %(user_id)s, %(requested_strokes)s, %(message)s, %(status)s,
                 %(submitted_at)s, %(resolved_at)s, %(resolved_by)s)
            """,
            row,
        )
    _invalidate("handicap_requests")


def update_handicap_request(request_id: str, updates: dict) -> None:
    clause, vals = _build_set(updates)
    with _cursor() as cur:
        cur.execute(
            f"UPDATE handicap_requests SET {clause} WHERE request_id = %s",
            vals + [request_id],
        )
    _invalidate("handicap_requests")
