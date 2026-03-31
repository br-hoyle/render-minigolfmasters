import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

import email_utils
import sheets
from dependencies import get_current_user, get_current_user_optional, require_tournament_admin
from models.registration import Registration

router = APIRouter()


class CreateRegistrationRequest(BaseModel):
    tournament_id: str


class UpdateRegistrationRequest(BaseModel):
    status: str  # accepted | rejected | forfeit | waitlisted


class BulkUpdateRegistrationRequest(BaseModel):
    registration_ids: list[str]
    status: str  # accepted | rejected | forfeit


@router.get("/", response_model=list[Registration])
def list_registrations(
    tournament_id: str | None = None,
    current_user: dict | None = Depends(get_current_user_optional),
):
    if tournament_id:
        # Public — tournament leaderboard / scores pages need this without auth
        regs = sheets.get_registrations_by_tournament(tournament_id)
    elif current_user and current_user.get("role") == "admin":
        # Admins can fetch all registrations across all tournaments
        regs = sheets.get_all_registrations()
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

    tournament = sheets.get_tournament_by_id(body.tournament_id)
    if not tournament:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tournament not found")

    # Check registration deadline
    deadline = str(tournament.get("registration_deadline") or "").strip()
    if deadline:
        today = datetime.now(tz=timezone.utc).date().isoformat()
        if today > deadline:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Registration deadline has passed")

    # Check player cap — count accepted registrations
    reg_status = "in_review"
    max_players_raw = str(tournament.get("max_players") or "").strip()
    if max_players_raw:
        try:
            max_players = int(max_players_raw)
            all_regs = sheets.get_registrations_by_tournament(body.tournament_id)
            accepted_count = sum(1 for r in all_regs if r["status"] == "accepted")
            if accepted_count >= max_players:
                reg_status = "waitlisted"
        except (ValueError, TypeError):
            pass

    registration_id = str(uuid.uuid4())
    now = datetime.now(tz=timezone.utc).isoformat()
    row = {
        "registration_id": registration_id,
        "tournament_id": body.tournament_id,
        "user_id": current_user["user_id"],
        "status": reg_status,
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


@router.patch("/bulk", status_code=status.HTTP_200_OK)
def bulk_update_registrations(
    body: BulkUpdateRegistrationRequest,
    current_user: dict = Depends(get_current_user),
):
    allowed_statuses = {"accepted", "rejected", "forfeit"}
    if body.status not in allowed_statuses:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid status: {body.status}")

    updated = 0
    errors = []
    for reg_id in body.registration_ids:
        try:
            reg = sheets.get_registration_by_id(reg_id)
            if not reg:
                errors.append({"id": reg_id, "error": "Not found"})
                continue
            # Verify permission via tournament admin check
            tournament = sheets.get_tournament_by_id(reg["tournament_id"])
            is_admin = current_user["role"] == "admin"
            is_tournament_admin = tournament and tournament.get("tournament_admin_id") == current_user["user_id"]
            if not is_admin and not is_tournament_admin:
                errors.append({"id": reg_id, "error": "Forbidden"})
                continue
            sheets.update_registration(reg_id, {"status": body.status})
            _send_registration_status_email(reg, body.status, tournament)
            updated += 1
        except Exception as e:
            errors.append({"id": reg_id, "error": str(e)})

    return {"updated": updated, "errors": errors}


@router.patch("/{registration_id}", response_model=Registration)
def update_registration(
    registration_id: str,
    body: UpdateRegistrationRequest,
    current_user: dict = Depends(get_current_user),
):
    reg = sheets.get_registration_by_id(registration_id)
    if not reg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found")

    allowed_statuses = {"accepted", "rejected", "forfeit", "waitlisted"}
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

    # Send confirmation email for accepted/rejected
    tournament = sheets.get_tournament_by_id(reg["tournament_id"])
    _send_registration_status_email(reg, body.status, tournament)

    # If rejected or forfeited, promote the oldest waitlisted registration
    if body.status in ("rejected", "forfeit") and tournament:
        _promote_waitlisted(reg["tournament_id"], tournament)

    return Registration(**reg)


def _send_registration_status_email(reg: dict, new_status: str, tournament: dict | None) -> None:
    """Send email notification when registration status changes to accepted or rejected."""
    if new_status not in ("accepted", "rejected"):
        return
    user = sheets.get_user_by_id(reg["user_id"])
    if not user or not user.get("email"):
        return
    tournament_name = tournament["name"] if tournament else "the tournament"
    first_name = user.get("first_name", "")
    if new_status == "accepted":
        subject = f"You're in! Registration accepted — {tournament_name}"
        body = (
            f"Hi {first_name},\n\n"
            f"Great news! Your registration for {tournament_name} has been accepted.\n\n"
            f"Head to Mini Golf Masters to submit your scores when the tournament goes live.\n\n"
            f"See you on the course!"
        )
    else:
        subject = f"Registration update — {tournament_name}"
        body = (
            f"Hi {first_name},\n\n"
            f"Unfortunately your registration for {tournament_name} was not accepted this time.\n\n"
            f"Contact the organizer if you have questions."
        )
    email_utils.send_email(user["email"], subject, body)


def _promote_waitlisted(tournament_id: str, tournament: dict) -> None:
    """Promote the oldest waitlisted registration to in_review when a spot opens."""
    all_regs = sheets.get_registrations_by_tournament(tournament_id)
    waitlisted = sorted(
        [r for r in all_regs if r["status"] == "waitlisted"],
        key=lambda r: r.get("submitted_at", ""),
    )
    if not waitlisted:
        return
    next_reg = waitlisted[0]
    sheets.update_registration(next_reg["registration_id"], {"status": "in_review"})
    user = sheets.get_user_by_id(next_reg["user_id"])
    if user and user.get("email"):
        email_utils.send_email(
            user["email"],
            f"Spot opened — {tournament['name']}",
            f"Hi {user.get('first_name', '')},\n\n"
            f"A spot has opened up in {tournament['name']} and your registration is now under review.\n\n"
            f"The organizer will confirm your registration shortly.",
        )
