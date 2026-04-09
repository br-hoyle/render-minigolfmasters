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
    email: str | None = None


class UpdateMeRequest(BaseModel):
    phone: str | None = None
    email: str | None = None
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


@router.get("/public/{user_id}")
def get_public_user(user_id: str):
    """Return minimal public info for a single user — no auth required."""
    u = sheets.get_user_by_id(user_id)
    if not u or u.get("status") == "inactive":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return {"user_id": u["user_id"], "first_name": u["first_name"], "last_name": u["last_name"]}


@router.get("/me", response_model=User)
def get_me(current_user: dict = Depends(get_current_user)):
    return User(**current_user)


@router.patch("/me", response_model=User)
def update_me(body: UpdateMeRequest, current_user: dict = Depends(get_current_user)):
    updates = {}
    if body.phone is not None:
        updates["phone"] = body.phone
    if body.email is not None and body.email != current_user.get("email"):
        existing = sheets.get_user_by_email(body.email)
        if existing and existing["user_id"] != current_user["user_id"]:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already in use")
        updates["email"] = body.email
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


@router.get("/{user_id}/stats")
def get_user_stats(user_id: str):
    """Compute public stats for a player profile page. No auth required."""
    from datetime import date as date_type, datetime

    u = sheets.get_user_by_id(user_id)
    if not u or u.get("status") == "inactive":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    all_reg_by_user = sheets.get_registrations_by_user(user_id)
    all_reg_all = sheets.get_all_registrations()
    all_tournaments = {t["tournament_id"]: t for t in sheets.get_all_tournaments() if not t.get("deleted_at")}
    all_rounds = sheets.get_all_rounds()
    all_scores = sheets.get_all_scores()
    all_pars = sheets.get_all_pars()
    all_holes = sheets.get_all_holes()
    all_handicaps = sheets.get_all_handicaps()

    today = date_type.today().isoformat()

    # Active pars
    par_map = {p["hole_id"]: int(p["par_strokes"]) for p in all_pars if str(p.get("active_to", ""))[:10] == "9999-12-31"}

    # Accepted (non-forfeit) registrations for this user
    accepted_regs = [r for r in all_reg_by_user if r["status"] == "accepted"]
    accepted_reg_ids = {r["registration_id"] for r in accepted_regs}

    # All scores for this user's accepted registrations
    user_scores = [s for s in all_scores if s["registration_id"] in accepted_reg_ids]

    # tournaments_entered & rounds_played
    tournaments_entered = len(accepted_regs)
    rounds_played = len({s["round_id"] for s in user_scores})

    # Scoring distribution
    eagle_or_better = 0
    birdie = 0
    par_count = 0
    bogey_count = 0
    double_plus = 0
    scored_holes = 0
    total_vs_par = 0.0

    for s in user_scores:
        p = par_map.get(s["hole_id"])
        if p is None:
            continue
        strokes = int(s["strokes"])
        diff = strokes - p
        scored_holes += 1
        total_vs_par += diff
        if diff <= -2:
            eagle_or_better += 1
        elif diff == -1:
            birdie += 1
        elif diff == 0:
            par_count += 1
        elif diff == 1:
            bogey_count += 1
        else:
            double_plus += 1

    scoring_avg_vs_par = round(total_vs_par / scored_holes, 2) if scored_holes > 0 else None
    scoring_distribution = {
        "eagle_or_better": eagle_or_better,
        "birdie": birdie,
        "par": par_count,
        "bogey": bogey_count,
        "double_plus": double_plus,
        "total": scored_holes,
    }

    # Per-round vs-par stats
    round_map = {r["round_id"]: r for r in all_rounds}
    lowest_round_vs_par = None
    highest_round_vs_par = None
    rounds_under_par = 0
    round_vs_par_values = []

    for reg in accepted_regs:
        reg_scores = [s for s in all_scores if s["registration_id"] == reg["registration_id"]]
        rounds_in_reg: dict[str, list] = {}
        for s in reg_scores:
            rounds_in_reg.setdefault(s["round_id"], []).append(s)
        for rid, round_scores in rounds_in_reg.items():
            rnd = round_map.get(rid)
            if not rnd:
                continue
            total = sum(int(s["strokes"]) for s in round_scores)
            course_holes = [h for h in all_holes if h.get("course_id") == rnd.get("course_id")]
            round_par = sum(par_map.get(h["hole_id"], 0) for h in course_holes)
            if round_par == 0 or total == 0:
                continue
            vs_par = total - round_par
            round_vs_par_values.append(vs_par)
            if lowest_round_vs_par is None or vs_par < lowest_round_vs_par:
                lowest_round_vs_par = vs_par
            if highest_round_vs_par is None or vs_par > highest_round_vs_par:
                highest_round_vs_par = vs_par
            if vs_par < 0:
                rounds_under_par += 1

    avg_round_vs_par = round(sum(round_vs_par_values) / len(round_vs_par_values), 1) if round_vs_par_values else None

    # Hole-in-ones
    hole_in_ones = sum(1 for s in user_scores if int(s["strokes"]) == 1)

    # First / last tournament dates
    def fmt_month_year(d: str) -> str:
        try:
            dt = datetime.strptime(d[:10], "%Y-%m-%d")
            return dt.strftime("%b %Y")
        except Exception:
            return d[:7]

    tournament_start_dates = sorted(
        t_val.get("start_date", "")
        for reg in accepted_regs
        if (t_val := all_tournaments.get(reg["tournament_id"])) and t_val.get("start_date")
    )
    first_tournament_date = fmt_month_year(tournament_start_dates[0]) if tournament_start_dates else None
    last_tournament_date = fmt_month_year(tournament_start_dates[-1]) if tournament_start_dates else None

    # Current handicap
    user_handicaps = sorted(
        [h for h in all_handicaps if h["user_id"] == user_id and str(h.get("active_to", ""))[:10] >= today],
        key=lambda h: str(h.get("active_from", "")),
        reverse=True,
    )
    current_handicap = int(user_handicaps[0]["strokes"]) if user_handicaps else None

    # Best finish, tournament history, championships (one pass over completed tournaments)
    best_finish = None
    championships = []
    tournament_history = []

    for reg in accepted_regs:
        t = all_tournaments.get(reg["tournament_id"])
        if not t or t.get("end_date", "") >= today:
            continue  # Only completed tournaments
        tid = t["tournament_id"]
        start_date = t.get("start_date", "")

        # All accepted registrations in this tournament
        t_regs = [r for r in all_reg_all if r["tournament_id"] == tid and r["status"] == "accepted"]
        player_nets = []
        for t_reg in t_regs:
            hc = next(
                (h for h in all_handicaps
                 if h["user_id"] == t_reg["user_id"]
                 and str(h.get("active_from", ""))[:10] <= start_date <= str(h.get("active_to", ""))[:10]),
                None,
            )
            t_scores = [s for s in all_scores if s["registration_id"] == t_reg["registration_id"]]
            gross = sum(int(s["strokes"]) for s in t_scores)
            if gross == 0:
                continue
            hc_strokes = int(hc["strokes"]) if hc else 0
            net = gross - hc_strokes
            player_nets.append({"user_id": t_reg["user_id"], "net": net, "gross": gross})

        if not player_nets:
            continue
        player_nets.sort(key=lambda x: x["net"])

        user_entry = next((p for p in player_nets if p["user_id"] == user_id), None)
        if user_entry is None:
            continue

        rank = 1 + sum(1 for p in player_nets if p["net"] < user_entry["net"])
        if best_finish is None or rank < best_finish:
            best_finish = rank
        if player_nets[0]["user_id"] == user_id:
            championships.append({"tournament_id": tid, "tournament_name": t["name"]})

        t_rounds = [r for r in all_rounds if r["tournament_id"] == tid]
        tournament_history.append({
            "tournament_id": tid,
            "tournament_name": t["name"],
            "year": t.get("start_date", "")[:4],
            "finish": rank,
            "total_players": len(player_nets),
            "rounds": len(t_rounds),
            "net_score": user_entry["net"],
            "gross_score": user_entry["gross"],
        })

    tournament_history.sort(key=lambda x: x["year"], reverse=True)

    # Field distribution (all scores in same tournaments this user played)
    field_tournament_ids = {reg["tournament_id"] for reg in accepted_regs}
    field_reg_ids = {r["registration_id"] for r in all_reg_all
                     if r["tournament_id"] in field_tournament_ids and r["status"] in ("accepted", "forfeit")}

    field_dist: dict = {"eagle_or_better": 0, "birdie": 0, "par": 0, "bogey": 0, "double_plus": 0, "total": 0}
    field_total_vs_par = 0.0
    for s in all_scores:
        if s["registration_id"] not in field_reg_ids or s["hole_id"] not in par_map:
            continue
        p = par_map[s["hole_id"]]
        diff = int(s["strokes"]) - p
        field_dist["total"] += 1
        field_total_vs_par += diff
        if diff <= -2:
            field_dist["eagle_or_better"] += 1
        elif diff == -1:
            field_dist["birdie"] += 1
        elif diff == 0:
            field_dist["par"] += 1
        elif diff == 1:
            field_dist["bogey"] += 1
        else:
            field_dist["double_plus"] += 1

    field_avg_vs_par = round(field_total_vs_par / field_dist["total"], 2) if field_dist["total"] > 0 else None

    return {
        "user_id": user_id,
        "tournaments_entered": tournaments_entered,
        "rounds_played": rounds_played,
        "total_holes_played": scored_holes,
        "best_finish": best_finish,
        "lowest_round_vs_par": lowest_round_vs_par,
        "highest_round_vs_par": highest_round_vs_par,
        "avg_round_vs_par": avg_round_vs_par,
        "rounds_under_par": rounds_under_par,
        "scoring_avg_vs_par": scoring_avg_vs_par,
        "current_handicap": current_handicap,
        "hole_in_ones": hole_in_ones,
        "scoring_distribution": scoring_distribution,
        "field_scoring_distribution": field_dist,
        "field_avg_vs_par": field_avg_vs_par,
        "championships": championships,
        "tournament_history": tournament_history,
    }


@router.patch("/{user_id}", response_model=User)
def update_user(user_id: str, body: UpdateUserRequest, _: dict = Depends(require_admin)):
    user = sheets.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if body.role is not None and body.role not in ("player", "admin"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role")
    if body.status is not None and body.status not in ("active", "inactive"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status")

    invite_sent = False
    if body.email is not None and body.email != user.get("email"):
        existing = sheets.get_user_by_email(body.email)
        if existing and existing["user_id"] != user_id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already in use")
        # If user hasn't accepted invite yet, generate fresh token and send to new address
        if not user.get("password_hash"):
            new_token = auth_utils.generate_invite_token()
            invite_url = f"{FRONTEND_URL}/accept-invite?token={new_token}"
            sheets.update_user(user_id, {"invite_token": new_token})
            email_utils.send_email(
                body.email,
                "You're invited to Mini Golf Masters",
                f"You've been invited! Set up your account here: {invite_url}",
            )
            invite_sent = True

    updates = body.model_dump(exclude_none=True)
    if updates:
        sheets.update_user(user_id, updates)
        user.update(updates)
    result = User(**user)
    result.invite_pending = not bool(user.get("password_hash", ""))
    return result


