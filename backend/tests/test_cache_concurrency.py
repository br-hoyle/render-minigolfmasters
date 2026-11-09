"""
Pure unit tests for sheets.py's in-memory cache: single-flight locking and
the generation-counter guard against the "stale write" race (a fetch that
started before a write finishing after it and repopulating the cache with
pre-write data).

Unlike test_scores_concurrency.py, these never call sheets._cursor() /
_get_pool() — every fetch is a fake function passed in by the test — so they
run with no database at all. Importing `sheets` still requires config.py's
required env vars to be present; dummy values are set below (setdefault, so
a real .env some environments auto-load via python-dotenv isn't clobbered)
purely so the import succeeds. The connection pool itself is created lazily
on first real use (see sheets._get_pool), so none of this risks opening an
actual connection.
"""

import os
import threading
import time

os.environ.setdefault("DATABASE_URL", "postgresql://unused:unused@localhost/unused")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret")
os.environ.setdefault("ADMIN_EMAIL", "admin@example.invalid")
os.environ.setdefault("GMAIL_CLIENT_ID", "unused")
os.environ.setdefault("GMAIL_CLIENT_SECRET", "unused")
os.environ.setdefault("GMAIL_REFRESH_TOKEN", "unused")

import sheets  # noqa: E402  (import after setting the env vars it needs)


def setup_function(_fn):
    """Each test gets a clean slate — these caches are module-level globals."""
    sheets._cache.clear()
    sheets._cache_generations.clear()
    sheets._cache_locks.clear()
    sheets._scores_cache.clear()


def test_interleaved_fetch_invalidate_never_leaves_stale_data():
    """A fetch that started before a write must not overwrite the cache with
    pre-write data after the write's invalidate() has already run."""
    fetch_started = threading.Event()
    invalidated = threading.Event()

    def slow_fetch():
        fetch_started.set()
        # Hold here until the "write" on another thread has invalidated the
        # cache, simulating a fetch that was already in flight.
        invalidated.wait(timeout=2)
        return ["stale-pre-write-data"]

    results = []

    def do_fetch():
        results.append(sheets._get_cached("tournaments", slow_fetch))

    t = threading.Thread(target=do_fetch)
    t.start()
    assert fetch_started.wait(timeout=2)

    # Simulate a concurrent write: invalidate while the fetch above is still
    # running.
    sheets._invalidate("tournaments")
    invalidated.set()
    t.join(timeout=2)

    # The in-flight fetch still returns its (now-stale) result to its own
    # caller — that's fine — but it must NOT have been stored in the cache.
    assert results == [["stale-pre-write-data"]]
    assert "tournaments" not in sheets._cache

    # A subsequent fetch must re-query, not reuse anything from the stale fetch.
    fresh_calls = []

    def fresh_fetch():
        fresh_calls.append(1)
        return ["fresh-data"]

    assert sheets._get_cached("tournaments", fresh_fetch) == ["fresh-data"]
    assert fresh_calls == [1]
    assert sheets._cache["tournaments"]["data"] == ["fresh-data"]


def test_scores_cache_global_generation_covers_never_before_seen_keys():
    """The scores cache's stale-write guard must also protect a key that
    was never cached before (and so has no per-key generation entry yet) —
    this is exactly the case a global generation counter is for."""
    fetch_started = threading.Event()
    invalidated = threading.Event()

    def slow_fetch():
        fetch_started.set()
        invalidated.wait(timeout=2)
        return ["stale-pre-write-scores"]

    results = []

    def do_fetch():
        results.append(sheets._get_scores_cached("scores:tournament:never-seen", slow_fetch))

    t = threading.Thread(target=do_fetch)
    t.start()
    assert fetch_started.wait(timeout=2)

    # A write for some *other* key invalidates the whole scores cache.
    sheets._invalidate_scores_cache()
    invalidated.set()
    t.join(timeout=2)

    assert results == [["stale-pre-write-scores"]]
    assert "scores:tournament:never-seen" not in sheets._scores_cache


def test_single_flight_only_one_thread_refetches_per_key():
    """Concurrent cache misses for the same key should trigger exactly one
    underlying fetch, not one per waiting thread."""
    call_count = {"n": 0}
    lock = threading.Lock()

    def counted_fetch():
        with lock:
            call_count["n"] += 1
        time.sleep(0.05)
        return ["data"]

    def do_fetch():
        sheets._get_cached("users", counted_fetch)

    threads = [threading.Thread(target=do_fetch) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=2)

    assert call_count["n"] == 1
