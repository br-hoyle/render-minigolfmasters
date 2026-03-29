import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

import sheets
from dependencies import get_current_user
from models.score import Score

router = APIRouter()


class SubmitScoreRequest(BaseModel):
    registration_id: str
    round_id: str
    hole_id: str
    strokes: int


class BulkSubmitScoresRequest(BaseModel):
    scores: list[SubmitScoreRequest]


@router.get("/", response_model=list[Score])
def list_scores(registration_id: str | None = None, round_id: str | None = None):
    if registration_id:
        return [Score(**s) for s in sheets.get_scores_by_registration(registration_id)]
    if round_id:
        return [Score(**s) for s in sheets.get_scores_by_round(round_id)]
    return [Score(**s) for s in sheets.get_all_scores()]


@router.post("/", status_code=status.HTTP_201_CREATED)
def submit_scores(body: BulkSubmitScoresRequest, current_user: dict = Depends(get_current_user)):
    now = datetime.now(tz=timezone.utc).isoformat()
    results = []

    for item in body.scores:
        reg = sheets.get_registration_by_id(item.registration_id)
        if not reg:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Registration {item.registration_id} not found")

        # Check tournament is active
        tournament = sheets.get_tournament_by_id(reg["tournament_id"])
        if not tournament:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tournament not found")

        is_privileged = current_user["role"] == "admin" or tournament.get("tournament_admin_id") == current_user["user_id"]

        if tournament.get("status") != "active" and not is_privileged:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Score submission is locked")

        if reg["user_id"] != current_user["user_id"] and not is_privileged:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot submit scores for another player")

        score_id = str(uuid.uuid4())
        row = {
            "score_id": score_id,
            "user_id": reg["user_id"],
            "registration_id": item.registration_id,
            "round_id": item.round_id,
            "hole_id": item.hole_id,
            "strokes": item.strokes,
            "submitted_at": now,
            "last_modified_by": current_user["user_id"],
            "last_modified_at": now,
        }
        sheets.upsert_score(item.registration_id, item.round_id, item.hole_id, row)
        results.append(row)

    return {"submitted": len(results)}


@router.patch("/{score_id}", response_model=Score)
def update_score(score_id: str, strokes: int, current_user: dict = Depends(get_current_user)):
    score = sheets.get_score_by_id(score_id)
    if not score:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Score not found")

    reg = sheets.get_registration_by_id(score["registration_id"])
    tournament = sheets.get_tournament_by_id(reg["tournament_id"])
    is_privileged = current_user["role"] == "admin" or tournament.get("tournament_admin_id") == current_user["user_id"]

    if tournament.get("status") != "active" and not is_privileged:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Score editing is locked")

    if score["user_id"] != current_user["user_id"] and not is_privileged:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot edit scores for another player")

    now = datetime.now(tz=timezone.utc).isoformat()
    updates = {"strokes": strokes, "last_modified_by": current_user["user_id"], "submitted_at": now, "last_modified_at": now}
    sheets.update_score(score_id, updates)
    score.update(updates)
    return Score(**score)
