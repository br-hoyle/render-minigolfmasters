"""
Player score-submission permissions in routers/scores.py.

Regression test for the bug where the "is the tournament active?" check read
tournament["status"] off the raw database row. Status is computed from the
dates and is not a column, so the check was always false and every
non-admin player got 403 "Score submission is locked".

No database needed: every sheets.py function the route touches is stubbed.
"""

import os
from datetime import datetime, timedelta

import pytest

# config.py requires these at import; nothing here connects to anything.
for _k in ("DATABASE_URL", "JWT_SECRET_KEY", "ADMIN_EMAIL", "GMAIL_CLIENT_ID",
           "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"):
    os.environ.setdefault(_k, "test-placeholder")

from fastapi import HTTPException  # noqa: E402

import sheets  # noqa: E402
from models.tournament import _TOURNAMENT_TZ, tournament_status  # noqa: E402
from routers import scores  # noqa: E402

PLAYER = {"user_id": "player-1", "role": "player"}
OTHER_PLAYER = {"user_id": "player-2", "role": "player"}
ADMIN = {"user_id": "admin-1", "role": "admin"}


def _day(offset):
    return (datetime.now(_TOURNAMENT_TZ).date() + timedelta(days=offset)).isoformat()


@pytest.fixture
def stub(monkeypatch):
    """A raw tournament row exactly as sheets.py returns it: no 'status' key."""
    state = {
        "tournament": {"tournament_id": "t1", "start_date": _day(0), "end_date": _day(0),
                       "tournament_admin_id": "someone-else"},
        "round": {"round_id": "r1", "locked": ""},
        "writes": [],
    }
    monkeypatch.setattr(sheets, "get_registration_by_id",
                        lambda rid: {"registration_id": rid, "tournament_id": "t1", "user_id": "player-1"})
    monkeypatch.setattr(sheets, "get_tournament_by_id", lambda tid: state["tournament"])
    monkeypatch.setattr(sheets, "get_round_by_id", lambda rid: state["round"])
    monkeypatch.setattr(sheets, "insert_score_audit_log", lambda row: None)

    def upsert(registration_id, round_id, hole_id, row, expected_version=None):
        state["writes"].append(row)
        return None, {**row, "version": 1}

    monkeypatch.setattr(sheets, "upsert_score", upsert)
    return state


def _submit(user):
    body = scores.BulkSubmitScoresRequest(scores=[
        scores.SubmitScoreRequest(registration_id="reg1", round_id="r1", hole_id="h1", strokes=3)
    ])
    return scores.submit_scores(body, current_user=user)


def test_player_can_submit_own_score_while_tournament_is_active(stub):
    result = _submit(PLAYER)
    assert result["submitted"] == 1
    assert len(stub["writes"]) == 1


def test_player_can_submit_on_any_day_of_a_multi_day_tournament(stub):
    stub["tournament"].update(start_date=_day(-1), end_date=_day(1))
    assert _submit(PLAYER)["submitted"] == 1


@pytest.mark.parametrize("start,end", [(1, 2), (-3, -1)])
def test_player_blocked_before_and_after_tournament(stub, start, end):
    stub["tournament"].update(start_date=_day(start), end_date=_day(end))
    with pytest.raises(HTTPException) as exc:
        _submit(PLAYER)
    assert exc.value.status_code == 403
    assert stub["writes"] == []


def test_admin_can_submit_after_tournament(stub):
    stub["tournament"].update(start_date=_day(-3), end_date=_day(-1))
    assert _submit(ADMIN)["submitted"] == 1


def test_player_blocked_on_locked_round(stub):
    stub["round"]["locked"] = "true"
    with pytest.raises(HTTPException) as exc:
        _submit(PLAYER)
    assert exc.value.status_code == 403 and exc.value.detail == "Round is locked"


def test_player_cannot_submit_for_someone_else(stub):
    with pytest.raises(HTTPException) as exc:
        _submit(OTHER_PLAYER)
    assert exc.value.status_code == 403
    assert stub["writes"] == []


def test_status_accepts_iso_timestamps_and_blank_end_date():
    assert tournament_status(_day(0) + "T00:00:00", "") == "active"
    assert tournament_status(_day(1), _day(1)) == "upcoming"
    assert tournament_status(_day(-1), _day(-1)) == "complete"
