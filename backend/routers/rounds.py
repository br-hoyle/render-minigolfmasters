import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

import sheets
from dependencies import get_current_user
from models.round import Round

router = APIRouter()


class CreateRoundRequest(BaseModel):
    tournament_id: str
    course_id: str
    round_number: int
    label: str


class UpdateRoundRequest(BaseModel):
    course_id: str | None = None
    round_number: int | None = None
    label: str | None = None


@router.get("/", response_model=list[Round])
def list_rounds(tournament_id: str | None = None):
    if tournament_id:
        return [Round(**r) for r in sheets.get_rounds_by_tournament(tournament_id)]
    return [Round(**r) for r in sheets.get_all_rounds()]


@router.get("/{round_id}", response_model=Round)
def get_round(round_id: str):
    r = sheets.get_round_by_id(round_id)
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Round not found")
    return Round(**r)


@router.post("/", response_model=Round, status_code=status.HTTP_201_CREATED)
def create_round(body: CreateRoundRequest, current_user: dict = Depends(get_current_user)):
    from dependencies import require_tournament_admin
    require_tournament_admin(body.tournament_id, current_user)

    round_id = str(uuid.uuid4())
    row = {
        "round_id": round_id,
        "tournament_id": body.tournament_id,
        "course_id": body.course_id,
        "round_number": body.round_number,
        "label": body.label,
    }
    sheets.insert_round(row)
    return Round(**row)


@router.patch("/{round_id}", response_model=Round)
def update_round(round_id: str, body: UpdateRoundRequest, current_user: dict = Depends(get_current_user)):
    r = sheets.get_round_by_id(round_id)
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Round not found")

    from dependencies import require_tournament_admin
    require_tournament_admin(r["tournament_id"], current_user)

    updates = body.model_dump(exclude_none=True)
    if updates:
        sheets.update_round(round_id, updates)
        r.update(updates)
    return Round(**r)


@router.delete("/{round_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_round(round_id: str, current_user: dict = Depends(get_current_user)):
    r = sheets.get_round_by_id(round_id)
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Round not found")

    from dependencies import require_tournament_admin
    require_tournament_admin(r["tournament_id"], current_user)

    sheets.delete_round(round_id)
