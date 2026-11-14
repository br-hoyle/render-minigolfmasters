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
from dates import TOURNAMENT_TZ as _TOURNAMENT_TZ, local_date  # noqa: E402
from models.tournament import tournament_status  # noqa: E402
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
        "round": {"round_id": "r1", "locked": "", "tournament_id": "t1", "course_id": "c1"},
        "reg_status": "accepted",
        "writes": [],
    }
    monkeypatch.setattr(sheets, "get_registration_by_id",
                        lambda rid: {"registration_id": rid, "tournament_id": "t1", "user_id": "player-1",
                                     "status": state["reg_status"]})
    monkeypatch.setattr(sheets, "get_holes_by_course",
                        lambda cid: [{"hole_id": "h1", "course_id": "c1"}] if cid == "c1" else [])
    monkeypatch.setattr(sheets, "get_tournament_by_id", lambda tid: state["tournament"])
    monkeypatch.setattr(sheets, "get_round_by_id", lambda rid: state["round"])
    monkeypatch.setattr(sheets, "insert_score_audit_log", lambda row: None)

    def upsert(registration_id, round_id, hole_id, row, expected_version=None):
        state["writes"].append(row)
        return None, {**row, "version": 1}

    monkeypatch.setattr(sheets, "upsert_score", upsert)
    return state


def _submit(user, hole_id="h1", strokes=3):
    body = scores.BulkSubmitScoresRequest(scores=[
        scores.SubmitScoreRequest(registration_id="reg1", round_id="r1", hole_id=hole_id, strokes=strokes)
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


@pytest.mark.parametrize("reg_status", ["in_review", "waitlisted", "rejected", "forfeit"])
def test_player_blocked_unless_registration_accepted(stub, reg_status):
    stub["reg_status"] = reg_status
    with pytest.raises(HTTPException) as exc:
        _submit(PLAYER)
    assert exc.value.status_code == 403
    assert stub["writes"] == []


def test_admin_can_score_for_a_forfeited_registration(stub):
    stub["reg_status"] = "forfeit"
    assert _submit(ADMIN)["submitted"] == 1


@pytest.mark.parametrize("user", [PLAYER, ADMIN])
def test_round_from_another_tournament_rejected(stub, user):
    stub["round"]["tournament_id"] = "some-other-tournament"
    with pytest.raises(HTTPException) as exc:
        _submit(user)
    assert exc.value.status_code == 400
    assert stub["writes"] == []


@pytest.mark.parametrize("user", [PLAYER, ADMIN])
def test_hole_not_on_the_rounds_course_rejected(stub, user):
    with pytest.raises(HTTPException) as exc:
        _submit(user, hole_id="hole-on-another-course")
    assert exc.value.status_code == 400
    assert stub["writes"] == []


def test_zero_strokes_rejected(stub):
    with pytest.raises(HTTPException) as exc:
        _submit(PLAYER, strokes=0)
    assert exc.value.status_code == 400


# --- pars / handicaps resolved for a tournament date -----------------------

def _par(hole, strokes, active_from, active_to="9999-12-31"):
    return {"par_id": f"{hole}-{active_from}", "hole_id": hole, "par_strokes": strokes,
            "active_from": active_from, "active_to": active_to}


def _resolved_pars(monkeypatch, rows, day):
    monkeypatch.setattr(sheets, "get_all_pars", lambda: rows)
    return {p["hole_id"]: p["par_strokes"] for p in sheets.get_pars_for_date(day)}


def test_par_set_on_the_morning_of_the_tournament_applies(monkeypatch):
    # 10am Central on the start date, stored as a UTC timestamp.
    rows = [_par("h1", 3, "2026-11-14T16:00:00+00:00")]
    assert _resolved_pars(monkeypatch, rows, "2026-11-14") == {"h1": 3}


def test_par_changed_on_tournament_day_resolves_to_the_new_value_only(monkeypatch):
    rows = [
        _par("h1", 2, "2026-01-01T12:00:00+00:00", active_to="2026-11-14"),
        _par("h1", 4, "2026-11-14T16:00:00+00:00"),
    ]
    monkeypatch.setattr(sheets, "get_all_pars", lambda: rows)
    resolved = sheets.get_pars_for_date("2026-11-14")
    assert [(p["hole_id"], p["par_strokes"]) for p in resolved] == [("h1", 4)]


def test_historical_par_is_kept_for_an_old_tournament(monkeypatch):
    rows = [
        _par("h1", 2, "2026-01-01T12:00:00+00:00", active_to="2026-09-01"),
        _par("h1", 4, "2026-09-01T16:00:00+00:00"),
    ]
    assert _resolved_pars(monkeypatch, rows, "2026-07-11") == {"h1": 2}


def test_par_entered_after_the_tournament_falls_back_to_current(monkeypatch):
    rows = [_par("h1", 3, "2026-12-01T16:00:00+00:00")]
    assert _resolved_pars(monkeypatch, rows, "2026-11-14") == {"h1": 3}


def test_handicap_set_in_the_evening_counts_as_that_local_day(monkeypatch):
    # 8pm Central on the 14th is already the 15th in UTC.
    rows = [{"handicap_id": "a", "user_id": "u1", "strokes": 5,
             "active_from": "2026-11-15T02:00:00+00:00", "active_to": "9999-12-31"}]
    monkeypatch.setattr(sheets, "get_all_handicaps", lambda: rows)
    assert sheets.get_handicap_for("u1", "2026-11-14")["strokes"] == 5
    assert sheets.get_handicap_for("u1", "2026-11-13") is None
    assert sheets.get_handicap_for("someone-else", "2026-11-14") is None


def test_handicap_changed_on_tournament_day_resolves_to_one_row(monkeypatch):
    rows = [
        {"handicap_id": "a", "user_id": "u1", "strokes": 2,
         "active_from": "2026-01-01T12:00:00+00:00", "active_to": "2026-11-14"},
        {"handicap_id": "b", "user_id": "u1", "strokes": 6,
         "active_from": "2026-11-14T15:00:00+00:00", "active_to": "9999-12-31"},
    ]
    monkeypatch.setattr(sheets, "get_all_handicaps", lambda: rows)
    assert [h["strokes"] for h in sheets.get_handicaps_for_date("2026-11-14")] == [6]


def test_local_date_handles_dates_timestamps_and_the_far_future():
    assert local_date("2026-11-14") == "2026-11-14"
    assert local_date("2026-11-15T02:00:00+00:00") == "2026-11-14"
    assert local_date("2026-11-15T02:00:00") == "2026-11-14"
    assert local_date("9999-12-31T23:59:59+00:00")[:4] == "9999"
    assert local_date("") == ""
