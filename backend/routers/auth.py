import smtplib
from email.mime.text import MIMEText

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

import auth as auth_utils
import sheets
from config import ADMIN_EMAIL, FRONTEND_URL, GMAIL_APP_PASSWORD

router = APIRouter()


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class AcceptInviteRequest(BaseModel):
    token: str
    password: str


class ResetPasswordRequest(BaseModel):
    email: str
    new_password: str


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest):
    user = sheets.get_user_by_email(body.email)
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not auth_utils.verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = auth_utils.create_access_token(user["user_id"], user["role"])
    return LoginResponse(access_token=token)


@router.post("/accept-invite")
def accept_invite(body: AcceptInviteRequest):
    user = sheets.get_user_by_invite_token(body.token)
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired invite token")
    if user.get("password_hash"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invite already used")
    hashed = auth_utils.hash_password(body.password)
    sheets.update_user(user["user_id"], {"password_hash": hashed, "invite_token": ""})
    return {"detail": "Account created"}


@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest):
    user = sheets.get_user_by_email(body.email)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    hashed = auth_utils.hash_password(body.new_password)
    sheets.update_user(user["user_id"], {"password_hash": hashed})
    return {"detail": "Password updated"}
