import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

import sheets
from dependencies import get_current_user, get_current_user_optional, require_admin
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
def list_scores(
    registration_id: str | None = None,
    round_id: str | None = None,
    tournament_id: str | None = None,
    current_user: dict | None = Depends(get_current_user_optional),
):
    if registration_id:
        return [Score(**s) for s in sheets.get_scores_by_registration(registration_id)]
    if round_id:
        return [Score(**s) for s in sheets.get_scores_by_round(round_id)]
    if tournament_id:
        return [Score(**s) for s in sheets.get_scores_by_tournament(tournament_id)]
    # Unfiltered — every score ever played. Admin only.
    if not current_user or current_user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required to list all scores")
    return [Score(**s) for s in sheets.get_all_scores()]


@router.post("/", status_code=status.HTTP_201_CREATED)
def submit_scores(body: BulkSubmitScoresRequest, current_user: dict = Depends(get_current_user)):
    now = datetime.now(tz=timezone.utc).isoformat()

    # --- Validate every item first. Any 403/404 aborts before any write. ---
    validated = []  # (item, reg, is_privileged)
    for item in body.scores:
        reg = sheets.get_registration_by_id(item.registration_id)
        if not reg:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Registration {item.registration_id} not found")

        tournament = sheets.get_tournament_by_id(reg["tournament_id"])
        if not tournament:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tournament not found")

        is_privileged = current_user["role"] == "admin" or tournament.get("tournament_admin_id") == current_user["user_id"]

        if tournament.get("status") != "active" and not is_privileged:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Score submission is locked")

        if reg["user_id"] != current_user["user_id"] and not is_privileged:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot submit scores for another player")

        round_data = sheets.get_round_by_id(item.round_id)
        if round_data and str(round_data.get("locked", "")).lower() == "true" and not is_privileged:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Round is locked")

        validated.append((item, reg, is_privileged))

    # --- Write each item independently; the version check happens
    # atomically with the write in sheets.upsert_score, not against a
    # possibly-stale cached read. ---
    saved = []
    conflicts = []
    for item, reg, is_privileged in validated:
        row = {
            "score_id": str(uuid.uuid4()),
            "user_id": reg["user_id"],
            "registration_id": item.registration_id,
            "round_id": item.round_id,
            "hole_id": item.hole_id,
            "strokes": item.strokes,
            "submitted_at": now,
            "last_modified_by": current_user["user_id"],
            "last_modified_at": now,
        }
        try:
            previous, new_row = sheets.upsert_score(
                item.registration_id, item.round_id, item.hole_id, row,
                expected_version=item.expected_version,
            )
        except sheets.ScoreVersionConflict as exc:
            current = exc.current_row
            conflicts.append({
                "hole_id": item.hole_id,
                "current_strokes": int(current.get("strokes") or 0),
                "current_version": int(current.get("version") or 1),
                "modified_by": current.get("last_modified_by", ""),
            })
            continue

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

        saved.append({
            "hole_id": new_row["hole_id"],
            "round_id": new_row["round_id"],
            "registration_id": new_row["registration_id"],
            "strokes": int(new_row["strokes"]),
            "version": int(new_row["version"]),
            "last_modified_by": new_row["last_modified_by"],
        })

    if conflicts:
        detail = {
            "message": "Some scores were modified by another user",
            "saved": saved,
            "conflicts": conflicts,
        }
        if len(body.scores) == 1:
            # Keep the original single-item conflict shape for callers that
            # haven't been updated to the multi-conflict shape yet.
            detail.update(conflicts[0])
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)

    return {"submitted": len(saved), "scores": saved}


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
