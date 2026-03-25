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
    role: str = "player"


@router.get("/", response_model=list[User])
def list_users(current_user: dict = Depends(require_admin)):
    return [User(**u) for u in sheets.get_all_users()]


@router.get("/me", response_model=User)
def get_me(current_user: dict = Depends(get_current_user)):
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
        "password_hash": "",
        "invite_token": token,
        "role": body.role,
        "created_at": now,
    })

    invite_url = f"{FRONTEND_URL}/accept-invite?token={token}"
    _send_invite_email(body.email, body.first_name, invite_url)

    return {"detail": "Invite sent", "user_id": user_id}


def _send_invite_email(to_email: str, first_name: str, invite_url: str) -> None:
    msg = MIMEText(
        f"Hi {first_name},\n\nYou've been invited to Mini Golf Masters!\n\nCreate your account here:\n{invite_url}\n\nSee you on the course!"
    )
    msg["Subject"] = "You're invited to Mini Golf Masters"
    msg["From"] = ADMIN_EMAIL
    msg["To"] = to_email

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(ADMIN_EMAIL, GMAIL_APP_PASSWORD)
        smtp.send_message(msg)
