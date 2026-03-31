from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

import auth as auth_utils
import email_utils
import sheets
from config import ADMIN_EMAIL, FRONTEND_URL

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


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetByTokenRequest(BaseModel):
    token: str
    new_password: str


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest):
    user = sheets.get_user_by_email(body.email)
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not auth_utils.verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if user.get("status") == "inactive":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated. Please contact your Mini Golf Masters Administrator for help.",
        )
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


@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordRequest):
    user = sheets.get_user_by_email(body.email)
    if not user:
        # Don't reveal whether the email exists
        return {"detail": "If that email is registered, a reset link has been sent."}
    token = auth_utils.generate_invite_token()
    sheets.update_user(user["user_id"], {"invite_token": token})
    reset_url = f"{FRONTEND_URL}/reset-password?token={token}"
    email_utils.send_email(
        body.email,
        "Reset your Mini Golf Masters password",
        f"Hi {user.get('first_name', '')},\n\nYou requested a password reset for Mini Golf Masters.\n\nClick the link below to set a new password:\n{reset_url}\n\nIf you didn't request this, you can safely ignore this email.",
    )
    return {"detail": "If that email is registered, a reset link has been sent."}


@router.post("/reset-password-by-token")
def reset_password_by_token(body: ResetByTokenRequest):
    user = sheets.get_user_by_invite_token(body.token)
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token")
    hashed = auth_utils.hash_password(body.new_password)
    sheets.update_user(user["user_id"], {"password_hash": hashed, "invite_token": ""})
    return {"detail": "Password updated"}


