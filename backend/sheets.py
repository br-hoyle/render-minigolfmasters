"""
Database abstraction layer — Supabase (PostgreSQL via psycopg2).

This is the ONLY file that imports or calls the database.
All routers call helper functions defined here.
"""

import time
from contextlib import contextmanager
from datetime import date, datetime

import psycopg2
import psycopg2.extras

from config import DATABASE_URL

# ---------------------------------------------------------------------------
# Connection — module-level singleton with automatic reconnect
# ---------------------------------------------------------------------------

_conn = None


def _get_conn():
    global _conn
    try:
        if _conn is None or _conn.closed:
            raise Exception("reconnect")
        # Cheap liveness check
        _conn.cursor().execute("SELECT 1")
    except Exception:
        _conn = psycopg2.connect(DATABASE_URL)
        _conn.autocommit = True
    return _conn


@contextmanager
def _cursor():
    conn = _get_conn()
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        yield cur


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
# ---------------------------------------------------------------------------

_CACHE_TTL: dict[str, int] = {
    "scores":            15,
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


def _get_cached(table: str, query_fn) -> list[dict]:
    entry = _cache.get(table)
    if entry and (time.monotonic() - entry["ts"]) < _CACHE_TTL[table]:
        return entry["data"]
    fresh = query_fn()
    _cache[table] = {"data": fresh, "ts": time.monotonic()}
    return fresh


def _invalidate(table: str) -> None:
    _cache.pop(table, None)


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
    return _get_cached("users", _fetch)


def get_user_by_email(email: str) -> dict | None:
    with _cursor() as cur:
        cur.execute("SELECT * FROM users WHERE email = %s", (email,))
        row = cur.fetchone()
        return _coerce(row) if row else None


def get_user_by_id(user_id: str) -> dict | None:
    with _cursor() as cur:
        cur.execute("SELECT * FROM users WHERE user_id = %s", (user_id,))
        row = cur.fetchone()
        return _coerce(row) if row else None


def get_user_by_invite_token(token: str) -> dict | None:
    with _cursor() as cur:
        cur.execute("SELECT * FROM users WHERE invite_token = %s", (token,))
        row = cur.fetchone()
        return _coerce(row) if row else None


def insert_user(row: dict) -> None:
    with _cursor() as cur:
        cur.execute(
            """
            INSERT INTO users
                (user_id, first_name, last_name, email, phone,
                 password_hash, invite_token, role, status, created_at)
            VALUES
                (%(user_id)s, %(first_name)s, %(last_name)s, %(email)s, %(phone)s,
                 %(password_hash)s, %(invite_token)s, %(role)s, %(status)s, %(created_at)s)
            """,
            row,
        )
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
    return _get_cached("courses", _fetch)


def get_course_by_id(course_id: str) -> dict | None:
    return next((c for c in get_all_courses() if c["course_id"] == course_id), None)


def insert_course(row: dict) -> None:
    with _cursor() as cur:
        cur.execute(
            """
            INSERT INTO courses (course_id, name, address, description, deleted_at)
            VALUES (%(course_id)s, %(name)s, %(address)s, %(description)s, %(deleted_at)s)
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
    return _get_cached("holes", _fetch)


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
    return _get_cached("pars", _fetch)


def get_pars_for_date(tournament_start_date: str) -> list[dict]:
    """Return pars active on tournament_start_date (SCD lookup)."""
    with _cursor() as cur:
        cur.execute(
            """
            SELECT * FROM pars
            WHERE active_from <= %s::date AND active_to >= %s::date
            """,
            (tournament_start_date, tournament_start_date),
        )
        return _coerce_rows(cur.fetchall())


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
    return _get_cached("handicaps", _fetch)


def get_handicap_for_user_date(user_id: str, tournament_start_date: str) -> dict | None:
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
    return _get_cached("tournaments", _fetch)


def get_tournament_by_id(tournament_id: str) -> dict | None:
    return next((t for t in get_all_tournaments() if t["tournament_id"] == tournament_id), None)


def insert_tournament(row: dict) -> None:
    with _cursor() as cur:
        cur.execute(
            """
            INSERT INTO tournaments
                (tournament_id, name, start_date, end_date, tournament_admin_id,
                 entry_fee, max_players, registration_deadline, deleted_at)
            VALUES
                (%(tournament_id)s, %(name)s, %(start_date)s, %(end_date)s, %(tournament_admin_id)s,
                 %(entry_fee)s, %(max_players)s, %(registration_deadline)s, %(deleted_at)s)
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
    return _get_cached("rounds", _fetch)


def get_rounds_by_tournament(tournament_id: str) -> list[dict]:
    return [r for r in get_all_rounds() if r["tournament_id"] == tournament_id]


def get_round_by_id(round_id: str) -> dict | None:
    return next((r for r in get_all_rounds() if r["round_id"] == round_id), None)


def insert_round(row: dict) -> None:
    with _cursor() as cur:
        cur.execute(
            """
            INSERT INTO rounds (round_id, tournament_id, course_id, round_number, label, locked)
            VALUES (%(round_id)s, %(tournament_id)s, %(course_id)s, %(round_number)s, %(label)s, %(locked)s)
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
    return _get_cached("registrations", _fetch)


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
    def _fetch():
        with _cursor() as cur:
            cur.execute("SELECT * FROM scores ORDER BY submitted_at DESC")
            return _coerce_rows(cur.fetchall())
    return _get_cached("scores", _fetch)


def get_scores_by_registration(registration_id: str) -> list[dict]:
    return [s for s in get_all_scores() if s["registration_id"] == registration_id]


def get_scores_by_round(round_id: str) -> list[dict]:
    return [s for s in get_all_scores() if s["round_id"] == round_id]


def get_score_by_id(score_id: str) -> dict | None:
    return next((s for s in get_all_scores() if s["score_id"] == score_id), None)


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
    _invalidate("scores")


def update_score(score_id: str, updates: dict) -> None:
    clause, vals = _build_set(updates)
    with _cursor() as cur:
        cur.execute(f"UPDATE scores SET {clause} WHERE score_id = %s", vals + [score_id])
    _invalidate("scores")


def upsert_score(registration_id: str, round_id: str, hole_id: str, row: dict) -> tuple[dict | None, dict]:
    """
    Insert or update a score identified by (registration_id, round_id, hole_id).
    Returns (previous_row_or_None, new_row). The version is incremented on update.
    """
    with _cursor() as cur:
        cur.execute(
            """
            SELECT * FROM scores
            WHERE registration_id = %s AND round_id = %s AND hole_id = %s
            """,
            (registration_id, round_id, hole_id),
        )
        existing = cur.fetchone()
    previous = _coerce(existing) if existing else None

    with _cursor() as cur:
        cur.execute(
            """
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
            RETURNING *
            """,
            row,
        )
        updated = cur.fetchone()
    _invalidate("scores")
    return previous, _coerce(updated)


# ---------------------------------------------------------------------------
# Score Audit Log
# ---------------------------------------------------------------------------

def get_score_audit_logs_by_score(score_id: str) -> list[dict]:
    with _cursor() as cur:
        cur.execute(
            "SELECT * FROM score_audit_log WHERE score_id = %s ORDER BY modified_at",
            (score_id,),
        )
        return _coerce_rows(cur.fetchall())


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
    return _get_cached("handicap_requests", _fetch)


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
