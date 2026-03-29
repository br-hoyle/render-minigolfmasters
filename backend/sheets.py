"""
Google Sheets abstraction layer.

This is the ONLY file that imports or calls the Google Sheets API.
All routers call helper functions defined here.
"""

import json
import time
from typing import Any

import gspread
from google.oauth2.service_account import Credentials

from config import GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_JSON

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
]

_client: gspread.Client | None = None
_spreadsheet: gspread.Spreadsheet | None = None

# ---------------------------------------------------------------------------
# In-memory TTL cache — reduces Sheets API calls from ~45 to ~20 per action
# ---------------------------------------------------------------------------

_CACHE_TTL: dict[str, int] = {
    "scores":        15,   # Changes frequently during active tournaments
    "registrations": 30,
    "tournaments":   60,
    "users":        120,
    "rounds":       120,
    "courses":      120,
    "holes":        120,
    "pars":         120,
    "handicaps":    120,
}

_cache: dict[str, dict] = {}
# Shape: { tab_name: {"data": list[dict], "ts": float} }


def _get_cached(tab: str) -> list[dict]:
    """Return cached data for tab if within TTL, otherwise fetch fresh from Sheets."""
    entry = _cache.get(tab)
    if entry and (time.monotonic() - entry["ts"]) < _CACHE_TTL[tab]:
        return entry["data"]
    fresh = _rows_to_dicts(_get_sheet(tab))
    _cache[tab] = {"data": fresh, "ts": time.monotonic()}
    return fresh


def _invalidate(tab: str) -> None:
    """Remove tab from cache so the next read fetches fresh data."""
    _cache.pop(tab, None)


def _get_spreadsheet() -> gspread.Spreadsheet:
    global _client, _spreadsheet
    if _spreadsheet is None:
        creds_dict = json.loads(GOOGLE_SERVICE_ACCOUNT_JSON)
        creds = Credentials.from_service_account_info(creds_dict, scopes=SCOPES)
        _client = gspread.authorize(creds)
        _spreadsheet = _client.open_by_key(GOOGLE_SHEET_ID)
    return _spreadsheet


def _get_sheet(tab: str) -> gspread.Worksheet:
    return _get_spreadsheet().worksheet(tab)


def _rows_to_dicts(sheet: gspread.Worksheet) -> list[dict[str, Any]]:
    records = sheet.get_all_records()
    return records


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

def get_all_users() -> list[dict]:
    return _get_cached("users")


def get_user_by_email(email: str) -> dict | None:
    users = get_all_users()
    return next((u for u in users if u["email"] == email), None)


def get_user_by_id(user_id: str) -> dict | None:
    users = get_all_users()
    return next((u for u in users if u["user_id"] == user_id), None)


def get_user_by_invite_token(token: str) -> dict | None:
    users = get_all_users()
    return next((u for u in users if u["invite_token"] == token), None)


def insert_user(row: dict) -> None:
    sheet = _get_sheet("users")
    headers = sheet.row_values(1)
    sheet.append_row([row.get(h, "") for h in headers])
    _invalidate("users")


def update_user(user_id: str, updates: dict) -> None:
    sheet = _get_sheet("users")
    records = sheet.get_all_records()
    headers = sheet.row_values(1)
    for i, record in enumerate(records, start=2):
        if record["user_id"] == user_id:
            for key, value in updates.items():
                if key in headers:
                    col = headers.index(key) + 1
                    sheet.update_cell(i, col, value)
            _invalidate("users")
            return


# ---------------------------------------------------------------------------
# Courses
# ---------------------------------------------------------------------------

def get_all_courses() -> list[dict]:
    return _get_cached("courses")


def get_course_by_id(course_id: str) -> dict | None:
    return next((c for c in get_all_courses() if c["course_id"] == course_id), None)


def insert_course(row: dict) -> None:
    sheet = _get_sheet("courses")
    headers = sheet.row_values(1)
    sheet.append_row([row.get(h, "") for h in headers])
    _invalidate("courses")


def update_course(course_id: str, updates: dict) -> None:
    sheet = _get_sheet("courses")
    records = sheet.get_all_records()
    headers = sheet.row_values(1)
    for i, record in enumerate(records, start=2):
        if record["course_id"] == course_id:
            for key, value in updates.items():
                if key in headers:
                    col = headers.index(key) + 1
                    sheet.update_cell(i, col, value)
            _invalidate("courses")
            return


def delete_course(course_id: str) -> None:
    sheet = _get_sheet("courses")
    records = sheet.get_all_records()
    for i, record in enumerate(records, start=2):
        if record["course_id"] == course_id:
            sheet.delete_rows(i)
            _invalidate("courses")
            return


# ---------------------------------------------------------------------------
# Holes
# ---------------------------------------------------------------------------

def get_all_holes() -> list[dict]:
    return _get_cached("holes")


def get_holes_by_course(course_id: str) -> list[dict]:
    return [h for h in get_all_holes() if h["course_id"] == course_id]


def insert_hole(row: dict) -> None:
    sheet = _get_sheet("holes")
    headers = sheet.row_values(1)
    sheet.append_row([row.get(h, "") for h in headers])
    _invalidate("holes")


def update_hole(hole_id: str, updates: dict) -> None:
    sheet = _get_sheet("holes")
    records = sheet.get_all_records()
    headers = sheet.row_values(1)
    for i, record in enumerate(records, start=2):
        if record["hole_id"] == hole_id:
            for key, value in updates.items():
                if key in headers:
                    col = headers.index(key) + 1
                    sheet.update_cell(i, col, value)
            _invalidate("holes")
            return


def delete_hole(hole_id: str) -> None:
    sheet = _get_sheet("holes")
    records = sheet.get_all_records()
    for i, record in enumerate(records, start=2):
        if record["hole_id"] == hole_id:
            sheet.delete_rows(i)
            _invalidate("holes")
            return


# ---------------------------------------------------------------------------
# Pars  (SCD)
# ---------------------------------------------------------------------------

def get_all_pars() -> list[dict]:
    return _get_cached("pars")


def get_pars_for_date(tournament_start_date: str) -> list[dict]:
    """Return pars active on tournament_start_date (SCD lookup).
    Compares date portion only to support datetime-stored active_from values.
    """
    return [
        p for p in get_all_pars()
        if str(p["active_from"])[:10] <= tournament_start_date <= str(p["active_to"])[:10]
    ]


def insert_par(row: dict) -> None:
    sheet = _get_sheet("pars")
    headers = sheet.row_values(1)
    sheet.append_row([row.get(h, "") for h in headers])
    _invalidate("pars")


def close_par(par_id: str, active_to: str) -> None:
    sheet = _get_sheet("pars")
    records = sheet.get_all_records()
    headers = sheet.row_values(1)
    col = headers.index("active_to") + 1
    for i, record in enumerate(records, start=2):
        if record["par_id"] == par_id:
            sheet.update_cell(i, col, active_to)
            _invalidate("pars")
            return


# ---------------------------------------------------------------------------
# Handicaps  (SCD)
# ---------------------------------------------------------------------------

def get_all_handicaps() -> list[dict]:
    return _get_cached("handicaps")


def get_handicap_for_user_date(user_id: str, tournament_start_date: str) -> dict | None:
    return next(
        (
            h for h in get_all_handicaps()
            if h["user_id"] == user_id
            and str(h["active_from"])[:10] <= tournament_start_date <= str(h["active_to"])[:10]
        ),
        None,
    )


def insert_handicap(row: dict) -> None:
    sheet = _get_sheet("handicaps")
    headers = sheet.row_values(1)
    sheet.append_row([row.get(h, "") for h in headers])
    _invalidate("handicaps")


def close_handicap(handicap_id: str, active_to: str) -> None:
    sheet = _get_sheet("handicaps")
    records = sheet.get_all_records()
    headers = sheet.row_values(1)
    col = headers.index("active_to") + 1
    for i, record in enumerate(records, start=2):
        if record["handicap_id"] == handicap_id:
            sheet.update_cell(i, col, active_to)
            _invalidate("handicaps")
            return


# ---------------------------------------------------------------------------
# Tournaments
# ---------------------------------------------------------------------------

def get_all_tournaments() -> list[dict]:
    return _get_cached("tournaments")


def get_tournament_by_id(tournament_id: str) -> dict | None:
    return next((t for t in get_all_tournaments() if t["tournament_id"] == tournament_id), None)


def insert_tournament(row: dict) -> None:
    sheet = _get_sheet("tournaments")
    headers = sheet.row_values(1)
    sheet.append_row([row.get(h, "") for h in headers])
    _invalidate("tournaments")


def update_tournament(tournament_id: str, updates: dict) -> None:
    sheet = _get_sheet("tournaments")
    records = sheet.get_all_records()
    headers = sheet.row_values(1)
    for i, record in enumerate(records, start=2):
        if record["tournament_id"] == tournament_id:
            for key, value in updates.items():
                if key in headers:
                    col = headers.index(key) + 1
                    sheet.update_cell(i, col, value)
            _invalidate("tournaments")
            return


# ---------------------------------------------------------------------------
# Rounds
# ---------------------------------------------------------------------------

def get_all_rounds() -> list[dict]:
    return _get_cached("rounds")


def get_rounds_by_tournament(tournament_id: str) -> list[dict]:
    return [r for r in get_all_rounds() if r["tournament_id"] == tournament_id]


def get_round_by_id(round_id: str) -> dict | None:
    return next((r for r in get_all_rounds() if r["round_id"] == round_id), None)


def insert_round(row: dict) -> None:
    sheet = _get_sheet("rounds")
    headers = sheet.row_values(1)
    sheet.append_row([row.get(h, "") for h in headers])
    _invalidate("rounds")


def update_round(round_id: str, updates: dict) -> None:
    sheet = _get_sheet("rounds")
    records = sheet.get_all_records()
    headers = sheet.row_values(1)
    for i, record in enumerate(records, start=2):
        if record["round_id"] == round_id:
            for key, value in updates.items():
                if key in headers:
                    col = headers.index(key) + 1
                    sheet.update_cell(i, col, value)
            _invalidate("rounds")
            return


def delete_round(round_id: str) -> None:
    sheet = _get_sheet("rounds")
    records = sheet.get_all_records()
    for i, record in enumerate(records, start=2):
        if record["round_id"] == round_id:
            sheet.delete_rows(i)
            _invalidate("rounds")
            return


# ---------------------------------------------------------------------------
# Registrations
# ---------------------------------------------------------------------------

def get_all_registrations() -> list[dict]:
    return _get_cached("registrations")


def get_registrations_by_tournament(tournament_id: str) -> list[dict]:
    return [r for r in get_all_registrations() if r["tournament_id"] == tournament_id]


def get_registrations_by_user(user_id: str) -> list[dict]:
    return [r for r in get_all_registrations() if r["user_id"] == user_id]


def get_registration_by_id(registration_id: str) -> dict | None:
    return next((r for r in get_all_registrations() if r["registration_id"] == registration_id), None)


def insert_registration(row: dict) -> None:
    sheet = _get_sheet("registrations")
    headers = sheet.row_values(1)
    sheet.append_row([row.get(h, "") for h in headers])
    _invalidate("registrations")


def update_registration(registration_id: str, updates: dict) -> None:
    sheet = _get_sheet("registrations")
    records = sheet.get_all_records()
    headers = sheet.row_values(1)
    for i, record in enumerate(records, start=2):
        if record["registration_id"] == registration_id:
            for key, value in updates.items():
                if key in headers:
                    col = headers.index(key) + 1
                    sheet.update_cell(i, col, value)
            _invalidate("registrations")
            return


# ---------------------------------------------------------------------------
# Scores
# ---------------------------------------------------------------------------

def get_all_scores() -> list[dict]:
    return _get_cached("scores")


def get_scores_by_registration(registration_id: str) -> list[dict]:
    return [s for s in get_all_scores() if s["registration_id"] == registration_id]


def get_scores_by_round(round_id: str) -> list[dict]:
    return [s for s in get_all_scores() if s["round_id"] == round_id]


def get_score_by_id(score_id: str) -> dict | None:
    return next((s for s in get_all_scores() if s["score_id"] == score_id), None)


def insert_score(row: dict) -> None:
    sheet = _get_sheet("scores")
    headers = sheet.row_values(1)
    sheet.append_row([row.get(h, "") for h in headers])
    _invalidate("scores")


def update_score(score_id: str, updates: dict) -> None:
    sheet = _get_sheet("scores")
    records = sheet.get_all_records()
    headers = sheet.row_values(1)
    for i, record in enumerate(records, start=2):
        if record["score_id"] == score_id:
            for key, value in updates.items():
                if key in headers:
                    col = headers.index(key) + 1
                    sheet.update_cell(i, col, value)
            _invalidate("scores")
            return


def upsert_score(registration_id: str, round_id: str, hole_id: str, updates: dict) -> None:
    """Update an existing score or insert if not found."""
    scores = get_all_scores()
    existing = next(
        (s for s in scores if s["registration_id"] == registration_id
         and s["round_id"] == round_id and s["hole_id"] == hole_id),
        None,
    )
    if existing:
        update_score(existing["score_id"], updates)
    else:
        insert_score(updates)
