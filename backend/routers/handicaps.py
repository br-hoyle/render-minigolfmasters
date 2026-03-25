import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

import sheets
from dependencies import require_admin
from models.handicap import Handicap

router = APIRouter()


class SetHandicapRequest(BaseModel):
    user_id: str
    strokes: int
    active_from: str  # YYYY-MM-DD


@router.get("/", response_model=list[Handicap])
def list_handicaps(user_id: str | None = None, tournament_start_date: str | None = None):
    all_h = sheets.get_all_handicaps()
    if user_id:
        all_h = [h for h in all_h if h["user_id"] == user_id]
    if tournament_start_date:
        all_h = [
            h for h in all_h
            if h["active_from"] <= tournament_start_date <= h["active_to"]
        ]
    return [Handicap(**h) for h in all_h]


@router.post("/", response_model=Handicap, status_code=status.HTTP_201_CREATED)
def set_handicap(body: SetHandicapRequest, _: dict = Depends(require_admin)):
    # Close existing active handicap for this user
    existing = sheets.get_handicap_for_user_date(body.user_id, "9999-12-31")
    if existing:
        sheets.close_handicap(existing["handicap_id"], body.active_from)

    handicap_id = str(uuid.uuid4())
    row = {
        "handicap_id": handicap_id,
        "user_id": body.user_id,
        "strokes": body.strokes,
        "active_from": body.active_from,
        "active_to": "9999-12-31",
    }
    sheets.insert_handicap(row)
    return Handicap(**row)
