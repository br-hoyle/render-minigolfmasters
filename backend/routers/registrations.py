import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

import sheets
from dependencies import get_current_user, get_current_user_optional
from models.registration import Registration

router = APIRouter()


class CreateRegistrationRequest(BaseModel):
    tournament_id: str


class UpdateRegistrationRequest(BaseModel):
    status: str  # accepted | rejected | forfeit


@router.get("/", response_model=list[Registration])
def list_registrations(
    tournament_id: str | None = None,
    current_user: dict | None = Depends(get_current_user_optional),
):
    if tournament_id:
        # Public — tournament leaderboard / scores pages need this without auth
        regs = sheets.get_registrations_by_tournament(tournament_id)
    elif current_user:
        regs = sheets.get_registrations_by_user(current_user["user_id"])
    else:
        from fastapi import HTTPException, status as http_status
        raise HTTPException(status_code=http_status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return [Registration(**r) for r in regs]


@router.post("/", response_model=Registration, status_code=status.HTTP_201_CREATED)
def create_registration(body: CreateRegistrationRequest, current_user: dict = Depends(get_current_user)):
    existing = sheets.get_registrations_by_user(current_user["user_id"])
    if any(r["tournament_id"] == body.tournament_id for r in existing):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already registered for this tournament")

    registration_id = str(uuid.uuid4())
    now = datetime.now(tz=timezone.utc).isoformat()
    row = {
        "registration_id": registration_id,
        "tournament_id": body.tournament_id,
        "user_id": current_user["user_id"],
        "status": "in_review",
        "submitted_at": now,
    }
    sheets.insert_registration(row)
    return Registration(**row)


@router.get("/{registration_id}", response_model=Registration)
def get_registration(registration_id: str, current_user: dict = Depends(get_current_user)):
    reg = sheets.get_registration_by_id(registration_id)
    if not reg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found")
    if reg["user_id"] != current_user["user_id"] and current_user["role"] != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return Registration(**reg)


@router.patch("/{registration_id}", response_model=Registration)
def update_registration(
    registration_id: str,
    body: UpdateRegistrationRequest,
    current_user: dict = Depends(get_current_user),
):
    reg = sheets.get_registration_by_id(registration_id)
    if not reg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found")

    allowed_statuses = {"accepted", "rejected", "forfeit"}
    if body.status not in allowed_statuses:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid status: {body.status}")

    # Players can only forfeit their own registration
    if current_user["role"] != "admin":
        if reg["user_id"] != current_user["user_id"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        if body.status != "forfeit":
            # Check if user is the tournament admin
            tournament = sheets.get_tournament_by_id(reg["tournament_id"])
            if not tournament or tournament.get("tournament_admin_id") != current_user["user_id"]:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    sheets.update_registration(registration_id, {"status": body.status})
    reg["status"] = body.status
    return Registration(**reg)
