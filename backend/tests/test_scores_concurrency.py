"""
Integration tests for the atomic version check in sheets.upsert_score and
the validate-before-write behavior in routers/scores.py:submit_scores.

See conftest.py for why these need a real, disposable test database.
"""

import threading
import uuid
from datetime import datetime, timezone

from conftest import requires_db


def _base_row(ids, strokes):
    now = datetime.now(tz=timezone.utc).isoformat()
    return {
        "score_id": str(uuid.uuid4()),
        "user_id": ids["user_id"],
        "registration_id": ids["registration_id"],
        "round_id": ids["round_id"],
        "hole_id": ids["hole_id"],
        "strokes": strokes,
        "submitted_at": now,
        "last_modified_by": ids["user_id"],
        "last_modified_at": now,
    }


@requires_db
def test_first_write_has_no_previous_row_and_version_one(db_fixtures):
    import sheets
    ids = db_fixtures

    previous, new = sheets.upsert_score(
        ids["registration_id"], ids["round_id"], ids["hole_id"], _base_row(ids, 3),
        expected_version=None,
    )

    assert previous is None
    assert int(new["version"]) == 1
    assert int(new["strokes"]) == 3


@requires_db
def test_concurrent_writes_with_same_expected_version_only_one_wins(db_fixtures):
    """Two concurrent requests for the same hole, both expecting version 1:
    exactly one succeeds and the other gets a ScoreVersionConflict."""
    import sheets
    ids = db_fixtures

    # Seed version 1.
    sheets.upsert_score(
        ids["registration_id"], ids["round_id"], ids["hole_id"], _base_row(ids, 3),
        expected_version=None,
    )

    successes = []
    conflicts = []
    barrier = threading.Barrier(2)

    def attempt(strokes):
        barrier.wait()  # line both threads up to maximize the race window
        try:
            _, new = sheets.upsert_score(
                ids["registration_id"], ids["round_id"], ids["hole_id"],
                _base_row(ids, strokes), expected_version=1,
            )
            successes.append(new)
        except sheets.ScoreVersionConflict as exc:
            conflicts.append(exc.current_row)

    threads = [threading.Thread(target=attempt, args=(s,)) for s in (4, 5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(successes) == 1
    assert len(conflicts) == 1
    assert int(successes[0]["version"]) == 2
    # The conflict's current_row reflects the write that *did* win.
    assert int(conflicts[0]["version"]) == 2
    assert int(conflicts[0]["strokes"]) == int(successes[0]["strokes"])


@requires_db
def test_expected_version_none_force_overwrites(db_fixtures):
    """expected_version=None (the 'Keep mine' force-save path) always wins."""
    import sheets
    ids = db_fixtures

    sheets.upsert_score(
        ids["registration_id"], ids["round_id"], ids["hole_id"], _base_row(ids, 3),
        expected_version=None,
    )
    previous, new = sheets.upsert_score(
        ids["registration_id"], ids["round_id"], ids["hole_id"], _base_row(ids, 9),
        expected_version=None,
    )

    assert previous is not None and int(previous["strokes"]) == 3
    assert int(new["strokes"]) == 9
    assert int(new["version"]) == 2


@requires_db
def test_bulk_submit_locked_round_writes_nothing(db_fixtures):
    """A bulk request with one locked-round item should write nothing at all,
    because every item is validated before any of them are written."""
    import auth as auth_utils
    import sheets
    from fastapi.testclient import TestClient
    from main import app

    ids = db_fixtures
    sheets.update_round(ids["round_id"], {"locked": "true"})

    client = TestClient(app)
    token = auth_utils.create_access_token(ids["user_id"], "player")
    headers = {"Authorization": f"Bearer {token}"}

    resp = client.post(
        "/scores/",
        json={
            "scores": [
                {
                    "registration_id": ids["registration_id"],
                    "round_id": ids["round_id"],
                    "hole_id": ids["hole_id"],
                    "strokes": 4,
                }
            ]
        },
        headers=headers,
    )

    assert resp.status_code == 403
    assert sheets.get_scores_by_registration(ids["registration_id"]) == []
