import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

import auth as auth_utils
import email_utils
import sheets
from config import FRONTEND_URL
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
    result = []
    for u in sheets.get_all_users():
        user = User(**u)
        user.invite_pending = not bool(u.get("password_hash", ""))
        result.append(user)
    return result


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
    email_sent = email_utils.send_email(
        body.email,
        "You're invited to Mini Golf Masters",
        f"Hi {body.first_name},\n\nYou've been invited to Mini Golf Masters!\n\nCreate your account here:\n{invite_url}\n\nSee you on the course!",
    )

    return {"detail": "Invite sent", "user_id": user_id, "email_sent": email_sent, "invite_url": invite_url}


@router.post("/{user_id}/resend-invite", status_code=status.HTTP_200_OK)
def resend_invite(user_id: str, _: dict = Depends(require_admin)):
    user = sheets.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.get("password_hash"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User has already accepted their invite")
    if user.get("status") == "inactive":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot resend invite to an inactive user")

    # Regenerate a fresh token so old links stop working
    token = auth_utils.generate_invite_token()
    sheets.update_user(user_id, {"invite_token": token})

    invite_url = f"{FRONTEND_URL}/accept-invite?token={token}"
    email_sent = email_utils.send_email(
        user["email"],
        "You're invited to Mini Golf Masters",
        f"Hi {user['first_name']},\n\nYou've been invited to Mini Golf Masters!\n\nCreate your account here:\n{invite_url}\n\nSee you on the course!",
    )

    return {"detail": "Invite resent", "email_sent": email_sent, "invite_url": invite_url}


@router.get("/{user_id}/championships")
def get_championships(user_id: str):
    """Return list of tournaments where this user won (lowest net score among accepted players)."""
    all_tournaments = [t for t in sheets.get_all_tournaments() if not t.get("deleted_at")]
    all_registrations = sheets.get_all_registrations()
    all_scores = sheets.get_all_scores()
    all_handicaps = sheets.get_all_handicaps()

    championships = []
    for t in all_tournaments:
        from datetime import date
        today = date.today().isoformat()
        end_date = t.get("end_date", "")
        if end_date >= today:
            continue  # Only completed tournaments

        start_date = t.get("start_date", "")
        regs = [r for r in all_registrations if r["tournament_id"] == t["tournament_id"] and r["status"] == "accepted"]
        if not regs:
            continue

        player_nets = []
        for reg in regs:
            handicap = next(
                (h for h in all_handicaps
                 if h["user_id"] == reg["user_id"]
                 and str(h.get("active_from", ""))[:10] <= start_date <= str(h.get("active_to", ""))[:10]),
                None,
            )
            player_scores = [s for s in all_scores if s["registration_id"] == reg["registration_id"]]
            gross = sum(int(s["strokes"]) for s in player_scores)
            if gross == 0:
                continue
            net = gross - int(handicap["strokes"] if handicap else 0)
            player_nets.append({"user_id": reg["user_id"], "net": net})

        if not player_nets:
            continue
        player_nets.sort(key=lambda x: x["net"])
        if player_nets[0]["user_id"] == user_id:
            championships.append({
                "tournament_id": t["tournament_id"],
                "tournament_name": t["name"],
                "net_score": player_nets[0]["net"],
            })

    return championships


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


