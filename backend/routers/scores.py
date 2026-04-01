import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

import sheets
from dependencies import get_current_user, require_admin
from models.score import Score
from models.score_audit_log import ScoreAuditLog

router = APIRouter()


class SubmitScoreRequest(BaseModel):
    registration_id: str
    round_id: str
    hole_id: str
    strokes: int
    expected_version: int | None = None


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

        # Check round lock
        round_data = sheets.get_round_by_id(item.round_id)
        if round_data and str(round_data.get("locked", "")).lower() == "true" and not is_privileged:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Round is locked")

        # Version conflict check
        if item.expected_version is not None:
            existing_scores = sheets.get_all_scores()
            existing = next(
                (s for s in existing_scores
                 if s["registration_id"] == item.registration_id
                 and s["round_id"] == item.round_id
                 and s["hole_id"] == item.hole_id),
                None,
            )
            if existing:
                current_version = int(existing.get("version") or 1)
                if current_version != item.expected_version:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail={
                            "message": "Score was modified by another user",
                            "current_strokes": int(existing["strokes"]),
                            "current_version": current_version,
                            "modified_by": existing.get("last_modified_by", ""),
                        },
                    )

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
            "version": 1,
        }
        previous, _ = sheets.upsert_score(item.registration_id, item.round_id, item.hole_id, row)

        # Audit log for privileged overrides of another player's score
        if is_privileged and reg["user_id"] != current_user["user_id"] and previous:
            sheets.insert_score_audit_log({
                "audit_id": str(uuid.uuid4()),
                "score_id": previous["score_id"],
                "previous_strokes": int(previous.get("strokes") or 0),
                "new_strokes": item.strokes,
                "modified_by": current_user["user_id"],
                "modified_at": now,
            })

        results.append(row)

    return {"submitted": len(results)}


@router.get("/{score_id}/audit", response_model=list[ScoreAuditLog])
def get_score_audit(score_id: str, current_user: dict = Depends(get_current_user)):
    score = sheets.get_score_by_id(score_id)
    if not score:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Score not found")
    # Must be admin or tournament admin
    if current_user["role"] != "admin":
        reg = sheets.get_registration_by_id(score["registration_id"])
        tournament = sheets.get_tournament_by_id(reg["tournament_id"]) if reg else None
        if not tournament or tournament.get("tournament_admin_id") != current_user["user_id"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    logs = sheets.get_score_audit_logs_by_score(score_id)
    return [ScoreAuditLog(**log) for log in logs]


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

    # Audit log for privileged overrides
    now = datetime.now(tz=timezone.utc).isoformat()
    if is_privileged and score["user_id"] != current_user["user_id"]:
        sheets.insert_score_audit_log({
            "audit_id": str(uuid.uuid4()),
            "score_id": score_id,
            "previous_strokes": int(score.get("strokes") or 0),
            "new_strokes": strokes,
            "modified_by": current_user["user_id"],
            "modified_at": now,
        })

    new_version = int(score.get("version") or 1) + 1
    updates = {
        "strokes": strokes,
        "last_modified_by": current_user["user_id"],
        "submitted_at": now,
        "last_modified_at": now,
        "version": new_version,
    }
    sheets.update_score(score_id, updates)
    score.update(updates)
    return Score(**score)
