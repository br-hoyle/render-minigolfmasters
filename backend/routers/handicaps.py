import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import sheets
from dependencies import require_admin
from models.handicap import Handicap

router = APIRouter()


class SetHandicapRequest(BaseModel):
    user_id: str
    strokes: int


@router.get("/", response_model=list[Handicap])
def list_handicaps(
    user_id: str | None = None,
    tournament_start_date: str | None = None,
    tournament_id: str | None = None,
):
    """With tournament_id or tournament_start_date: at most one handicap per
    user, the one in effect for that tournament. Otherwise full history."""
    if tournament_id:
        t = sheets.get_tournament_by_id(tournament_id)
        if not t:
            raise HTTPException(status_code=404, detail="Tournament not found")
        tournament_start_date = t.get("start_date", "")
    if tournament_start_date:
        all_h = sheets.get_handicaps_for_date(tournament_start_date)
    else:
        all_h = sheets.get_all_handicaps()
    if user_id:
        all_h = [h for h in all_h if h["user_id"] == user_id]
    return [Handicap(**h) for h in all_h]


@router.post("/", response_model=Handicap, status_code=201)
def set_handicap(body: SetHandicapRequest, _: dict = Depends(require_admin)):
    now = datetime.now(tz=timezone.utc).isoformat()

    # Close existing active handicap for this user
    existing = sheets.get_handicap_for_user_date(body.user_id, "9999-12-31")
    if existing:
        sheets.close_handicap(existing["handicap_id"], now)

    handicap_id = str(uuid.uuid4())
    row = {
        "handicap_id": handicap_id,
        "user_id": body.user_id,
        "strokes": body.strokes,
        "active_from": now,
        "active_to": "9999-12-31",
    }
    sheets.insert_handicap(row)
    return Handicap(**row)
