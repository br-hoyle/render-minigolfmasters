import smtplib
import uuid
from email.mime.text import MIMEText

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

import auth as auth_utils
import sheets
from config import ADMIN_EMAIL, FRONTEND_URL, GMAIL_APP_PASSWORD
from dependencies import get_current_user, require_admin
from models.user import User

router = APIRouter()


class InviteRequest(BaseModel):
    first_name: str
    last_name: str
    email: str
    phone: str = ""
    role: str = "player"


class UpdateUserRequest(BaseModel):
    role: str | None = None
    status: str | None = None
    phone: str | None = None


class UpdateMeRequest(BaseModel):
    phone: str | None = None
    current_password: str | None = None
    new_password: str | None = None


@router.get("/", response_model=list[User])
def list_users(current_user: dict = Depends(require_admin)):
    return [User(**u) for u in sheets.get_all_users()]


@router.get("/public")
def list_users_public():
    """Return minimal user info (id + name only) — no auth required. Used by public leaderboard."""
    return [
        {"user_id": u["user_id"], "first_name": u["first_name"], "last_name": u["last_name"]}
        for u in sheets.get_all_users()
        if u.get("status") != "inactive"
    ]


@router.get("/me", response_model=User)
def get_me(current_user: dict = Depends(get_current_user)):
    return User(**current_user)


@router.patch("/me", response_model=User)
def update_me(body: UpdateMeRequest, current_user: dict = Depends(get_current_user)):
    updates = {}
    if body.phone is not None:
        updates["phone"] = body.phone
    if body.new_password:
        if not body.current_password:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="current_password required")
        if not auth_utils.verify_password(body.current_password, current_user.get("password_hash", "")):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
        updates["password_hash"] = auth_utils.hash_password(body.new_password)
    if updates:
        sheets.update_user(current_user["user_id"], updates)
        current_user.update(updates)
    return User(**current_user)


@router.post("/invite", status_code=status.HTTP_201_CREATED)
def invite_user(body: InviteRequest, current_user: dict = Depends(require_admin)):
    existing = sheets.get_user_by_email(body.email)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    token = auth_utils.generate_invite_token()
    user_id = str(uuid.uuid4())
    from datetime import datetime, timezone
    now = datetime.now(tz=timezone.utc).isoformat()

    sheets.insert_user({
        "user_id": user_id,
        "first_name": body.first_name,
        "last_name": body.last_name,
        "email": body.email,
        "phone": body.phone,
        "password_hash": "",
        "invite_token": token,
        "role": body.role,
        "status": "active",
        "created_at": now,
    })

    invite_url = f"{FRONTEND_URL}/accept-invite?token={token}"
    email_sent = True
    try:
        _send_invite_email(body.email, body.first_name, invite_url)
    except Exception:
        email_sent = False

    return {"detail": "Invite sent", "user_id": user_id, "email_sent": email_sent, "invite_url": invite_url}


@router.patch("/{user_id}", response_model=User)
def update_user(user_id: str, body: UpdateUserRequest, _: dict = Depends(require_admin)):
    user = sheets.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if body.role is not None and body.role not in ("player", "admin"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role")
    if body.status is not None and body.status not in ("active", "inactive"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status")
    updates = body.model_dump(exclude_none=True)
    if updates:
        sheets.update_user(user_id, updates)
        user.update(updates)
    return User(**user)


def _send_invite_email(to_email: str, first_name: str, invite_url: str) -> None:
    msg = MIMEText(
        f"Hi {first_name},\n\nYou've been invited to Mini Golf Masters!\n\nCreate your account here:\n{invite_url}\n\nSee you on the course!"
    )
    msg["Subject"] = "You're invited to Mini Golf Masters"
    msg["From"] = ADMIN_EMAIL
    msg["To"] = to_email

    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10) as smtp:
        smtp.login(ADMIN_EMAIL, GMAIL_APP_PASSWORD)
        smtp.send_message(msg)
