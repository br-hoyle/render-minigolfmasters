import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

import sheets
from dependencies import get_current_user, require_admin
from models.tournament import Tournament

router = APIRouter()


class CreateTournamentRequest(BaseModel):
    name: str
    start_date: str
    end_date: str
    entry_fee: str = ""


class UpdateTournamentRequest(BaseModel):
    name: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    entry_fee: str | None = None


@router.get("/", response_model=list[Tournament])
def list_tournaments():
    return [Tournament(**t) for t in sheets.get_all_tournaments() if not t.get("deleted_at")]


@router.get("/{tournament_id}", response_model=Tournament)
def get_tournament(tournament_id: str):
    t = sheets.get_tournament_by_id(tournament_id)
    if not t:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tournament not found")
    return Tournament(**t)


@router.post("/", response_model=Tournament, status_code=status.HTTP_201_CREATED)
def create_tournament(body: CreateTournamentRequest, current_user: dict = Depends(require_admin)):
    tournament_id = str(uuid.uuid4())
    row = {
        "tournament_id": tournament_id,
        "name": body.name,
        "start_date": body.start_date,
        "end_date": body.end_date,
        "tournament_admin_id": current_user["user_id"],
        "entry_fee": body.entry_fee,
    }
    sheets.insert_tournament(row)
    return Tournament(**row)


@router.patch("/{tournament_id}", response_model=Tournament)
def update_tournament(
    tournament_id: str,
    body: UpdateTournamentRequest,
    current_user: dict = Depends(get_current_user),
):
    from dependencies import require_tournament_admin
    require_tournament_admin(tournament_id, current_user)

    t = sheets.get_tournament_by_id(tournament_id)
    if not t:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tournament not found")

    updates = body.model_dump(exclude_none=True)
    if updates:
        sheets.update_tournament(tournament_id, updates)
        t.update(updates)

    return Tournament(**t)


@router.delete("/{tournament_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tournament(tournament_id: str, current_user: dict = Depends(require_admin)):
    t = sheets.get_tournament_by_id(tournament_id)
    if not t:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tournament not found")
    now = datetime.now(tz=timezone.utc).isoformat()
    sheets.update_tournament(tournament_id, {"deleted_at": now})
