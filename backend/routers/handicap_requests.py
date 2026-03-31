import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

import email_utils
import sheets
from config import ADMIN_EMAIL
from dependencies import get_current_user, require_admin
from models.handicap_request import HandicapRequest

router = APIRouter()


class CreateHandicapRequestBody(BaseModel):
    requested_strokes: int
    message: str = ""


class ResolveHandicapRequestBody(BaseModel):
    status: str  # approved | rejected


@router.post("/", response_model=HandicapRequest, status_code=status.HTTP_201_CREATED)
def create_handicap_request(body: CreateHandicapRequestBody, current_user: dict = Depends(get_current_user)):
    # Only one pending request per user at a time
    existing = sheets.get_handicap_requests_by_user(current_user["user_id"])
    if any(r["status"] == "pending" for r in existing):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You already have a pending handicap request")

    request_id = str(uuid.uuid4())
    now = datetime.now(tz=timezone.utc).isoformat()
    row = {
        "request_id": request_id,
        "user_id": current_user["user_id"],
        "requested_strokes": body.requested_strokes,
        "message": body.message,
        "status": "pending",
        "submitted_at": now,
        "resolved_at": "",
        "resolved_by": "",
    }
    sheets.insert_handicap_request(row)

    # Notify admin
    name = f"{current_user.get('first_name', '')} {current_user.get('last_name', '')}".strip()
    email_utils.send_email(
        ADMIN_EMAIL,
        "New handicap review request — Mini Golf Masters",
        f"{name} has requested a handicap review.\n\nRequested strokes: {body.requested_strokes}\nMessage: {body.message or '(none)'}",
    )

    return HandicapRequest(**row)


@router.get("/me", response_model=list[HandicapRequest])
def get_my_handicap_requests(current_user: dict = Depends(get_current_user)):
    reqs = sheets.get_handicap_requests_by_user(current_user["user_id"])
    return [HandicapRequest(**r) for r in reqs]


@router.get("/", response_model=list[HandicapRequest])
def list_handicap_requests(_: dict = Depends(require_admin)):
    reqs = sheets.get_all_handicap_requests()
    return [HandicapRequest(**r) for r in reqs]


@router.patch("/{request_id}", response_model=HandicapRequest)
def resolve_handicap_request(
    request_id: str,
    body: ResolveHandicapRequestBody,
    current_user: dict = Depends(require_admin),
):
    if body.status not in ("approved", "rejected"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="status must be approved or rejected")

    req = next((r for r in sheets.get_all_handicap_requests() if r["request_id"] == request_id), None)
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if req["status"] != "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Request already resolved")

    now = datetime.now(tz=timezone.utc).isoformat()
    sheets.update_handicap_request(request_id, {
        "status": body.status,
        "resolved_at": now,
        "resolved_by": current_user["user_id"],
    })

    if body.status == "approved":
        # Apply new handicap via SCD logic
        user_id = req["user_id"]
        all_handicaps = sheets.get_all_handicaps()
        for h in all_handicaps:
            if h["user_id"] == user_id and str(h.get("active_to", ""))[:10] == "9999-12-31":
                sheets.close_handicap(h["handicap_id"], now)
        handicap_id = str(uuid.uuid4())
        sheets.insert_handicap({
            "handicap_id": handicap_id,
            "user_id": user_id,
            "strokes": req["requested_strokes"],
            "active_from": now,
            "active_to": "9999-12-31",
        })

        # Notify player
        user = sheets.get_user_by_id(user_id)
        if user and user.get("email"):
            email_utils.send_email(
                user["email"],
                "Handicap updated — Mini Golf Masters",
                f"Hi {user.get('first_name', '')},\n\nYour handicap has been updated to {req['requested_strokes']} strokes.",
            )

    req.update({"status": body.status, "resolved_at": now, "resolved_by": current_user["user_id"]})
    return HandicapRequest(**req)
