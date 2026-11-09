"""
Pure unit tests for sheets.py's read-retry wrapper and idle-connection
recycling (Phase 2.3 of the tournament concurrency plan). No database
involved — see test_cache_concurrency.py's module docstring for why the
dummy env vars below are safe; the connection pool is created lazily and
none of these tests touch it (idle-recycling is tested against a fake pool
object, not a real one).
"""

import os
import time

os.environ.setdefault("DATABASE_URL", "postgresql://unused:unused@localhost/unused")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret")
os.environ.setdefault("ADMIN_EMAIL", "admin@example.invalid")
os.environ.setdefault("GMAIL_CLIENT_ID", "unused")
os.environ.setdefault("GMAIL_CLIENT_SECRET", "unused")
os.environ.setdefault("GMAIL_REFRESH_TOKEN", "unused")

import psycopg2  # noqa: E402
import pytest  # noqa: E402

import sheets  # noqa: E402


def test_with_read_retry_retries_once_on_operational_error():
    calls = {"n": 0}

    def flaky():
        calls["n"] += 1
        if calls["n"] == 1:
            raise psycopg2.OperationalError("connection reset")
        return "ok"

    assert sheets._with_read_retry(flaky) == "ok"
    assert calls["n"] == 2


def test_with_read_retry_raises_if_second_attempt_also_fails():
    def always_fails():
        raise psycopg2.InterfaceError("still broken")

    with pytest.raises(psycopg2.InterfaceError):
        sheets._with_read_retry(always_fails)


def test_with_read_retry_does_not_retry_other_exceptions():
    """Only a dead-connection error gets a retry; a normal bug (e.g. a bad
    query) should surface immediately, not run twice."""
    calls = {"n": 0}

    def raises_value_error():
        calls["n"] += 1
        raise ValueError("not a connection problem")

    with pytest.raises(ValueError):
        sheets._with_read_retry(raises_value_error)
    assert calls["n"] == 1


class _FakeConn:
    def __init__(self, closed=0, last_used=None):
        self.closed = closed
        self.last_used = last_used if last_used is not None else time.monotonic()


class _FakePool:
    """Stands in for psycopg2.pool.ThreadedConnectionPool: hands out
    pre-built fake connections in order and records what gets put back."""

    def __init__(self, conns):
        self._conns = list(conns)
        self.putconn_calls = []

    def getconn(self):
        return self._conns.pop(0)

    def putconn(self, conn, close=False):
        self.putconn_calls.append((conn, close))


def test_checkout_connection_recycles_idle_connection():
    stale = _FakeConn(last_used=time.monotonic() - (sheets._MAX_IDLE_SECONDS + 10))
    fresh = _FakeConn(last_used=time.monotonic())
    pool = _FakePool([stale, fresh])

    result = sheets._checkout_connection(pool)

    assert result is fresh
    assert pool.putconn_calls == [(stale, True)]


def test_checkout_connection_recycles_closed_connection():
    closed_conn = _FakeConn(closed=1)
    fresh = _FakeConn()
    pool = _FakePool([closed_conn, fresh])

    result = sheets._checkout_connection(pool)

    assert result is fresh
    assert pool.putconn_calls == [(closed_conn, True)]


def test_checkout_connection_reuses_a_fresh_connection_as_is():
    fresh = _FakeConn()
    pool = _FakePool([fresh])

    result = sheets._checkout_connection(pool)

    assert result is fresh
    assert pool.putconn_calls == []
