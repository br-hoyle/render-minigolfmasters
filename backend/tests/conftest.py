"""
Shared fixtures for the integration tests in this directory.

These tests exercise sheets.py (and, through it, routers/scores.py) against
a REAL Postgres database — importing `sheets` opens a connection pool at
import time, so DATABASE_URL must already point at a reachable database
before pytest even collects this package.

Point DATABASE_URL at a disposable test Supabase project — NEVER at
production. These tests insert and delete rows (cleaned up by each
fixture), but a bug in a fixture or a test could leave rows behind, which
you do not want happening against real tournament data.

If DATABASE_URL isn't set, every test module in this directory should guard
its tests with the `requires_db` marker below so `pytest` still runs
cleanly elsewhere in the repo.
"""

import os
import uuid

import pytest

REQUIRES_DB_REASON = (
    "DATABASE_URL is not set. Point it at a disposable test Supabase "
    "project (never production) to run these integration tests."
)

requires_db = pytest.mark.skipif(not os.environ.get("DATABASE_URL"), reason=REQUIRES_DB_REASON)


@pytest.fixture
def db_fixtures():
    """Create a minimal user/course/hole/tournament/round/registration, then clean up."""
    import sheets  # imported lazily so pytest can still collect without DATABASE_URL set

    ids = {
        "user_id": str(uuid.uuid4()),
        "course_id": str(uuid.uuid4()),
        "hole_id": str(uuid.uuid4()),
        "tournament_id": str(uuid.uuid4()),
        "round_id": str(uuid.uuid4()),
        "registration_id": str(uuid.uuid4()),
    }
    email = f"loadtest-{ids['user_id']}@example.invalid"

    with sheets._cursor() as cur:
        cur.execute(
            """
            INSERT INTO users
                (user_id, first_name, last_name, email, phone, password_hash,
                 invite_token, role, status, created_at)
            VALUES
                (%(user_id)s, 'Test', 'Player', %(email)s, '555-0100', 'x',
                 '', 'player', 'active', now())
            """,
            {**ids, "email": email},
        )
        cur.execute(
            "INSERT INTO courses (course_id, name, address, description) "
            "VALUES (%(course_id)s, 'Test Course', '', '')",
            ids,
        )
        cur.execute(
            "INSERT INTO holes (hole_id, course_id, hole_number) "
            "VALUES (%(hole_id)s, %(course_id)s, 1)",
            ids,
        )
        cur.execute(
            """
            INSERT INTO tournaments
                (tournament_id, name, start_date, end_date, status,
                 tournament_admin_id, entry_fee, max_players, registration_deadline)
            VALUES
                (%(tournament_id)s, 'Test Tournament', current_date, current_date, 'active',
                 %(user_id)s, '', '', '')
            """,
            ids,
        )
        cur.execute(
            """
            INSERT INTO rounds (round_id, tournament_id, course_id, round_number, label, locked)
            VALUES (%(round_id)s, %(tournament_id)s, %(course_id)s, 1, 'Round 1', '')
            """,
            ids,
        )
        cur.execute(
            """
            INSERT INTO registrations (registration_id, tournament_id, user_id, status, submitted_at)
            VALUES (%(registration_id)s, %(tournament_id)s, %(user_id)s, 'accepted', now())
            """,
            ids,
        )

    try:
        yield ids
    finally:
        with sheets._cursor() as cur:
            cur.execute(
                "DELETE FROM score_audit_log WHERE score_id IN "
                "(SELECT score_id FROM scores WHERE registration_id = %(registration_id)s)",
                ids,
            )
            cur.execute("DELETE FROM scores WHERE registration_id = %(registration_id)s", ids)
            cur.execute("DELETE FROM registrations WHERE registration_id = %(registration_id)s", ids)
            cur.execute("DELETE FROM rounds WHERE round_id = %(round_id)s", ids)
            cur.execute("DELETE FROM tournaments WHERE tournament_id = %(tournament_id)s", ids)
            cur.execute("DELETE FROM holes WHERE hole_id = %(hole_id)s", ids)
            cur.execute("DELETE FROM courses WHERE course_id = %(course_id)s", ids)
            cur.execute("DELETE FROM users WHERE user_id = %(user_id)s", ids)
