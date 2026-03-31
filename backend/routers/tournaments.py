import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

import email_utils
import sheets
from dependencies import get_current_user, require_admin
from models.tournament import Tournament

router = APIRouter()


class CreateTournamentRequest(BaseModel):
    name: str
    start_date: str
    end_date: str
    entry_fee: str = ""
    max_players: str = ""
    registration_deadline: str = ""


class UpdateTournamentRequest(BaseModel):
    name: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    entry_fee: str | None = None
    max_players: str | None = None
    registration_deadline: str | None = None


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
        "max_players": body.max_players,
        "registration_deadline": body.registration_deadline,
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


@router.get("/{tournament_id}/recap")
def get_tournament_recap(tournament_id: str):
    """Compute post-tournament summary stats."""
    t = sheets.get_tournament_by_id(tournament_id)
    if not t:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tournament not found")

    registrations = sheets.get_registrations_by_tournament(tournament_id)
    accepted = [r for r in registrations if r["status"] in ("accepted", "forfeit")]
    rounds = sheets.get_rounds_by_tournament(tournament_id)
    all_scores = sheets.get_all_scores()
    all_pars = sheets.get_all_pars()
    all_handicaps = sheets.get_all_handicaps()
    users = sheets.get_all_users()

    start_date = t.get("start_date", "")
    active_pars = [p for p in all_pars if str(p.get("active_from", ""))[:10] <= start_date <= str(p.get("active_to", ""))[:10]]
    if not active_pars:
        active_pars = [p for p in all_pars if str(p.get("active_to", ""))[:10] == "9999-12-31"]
    par_map = {p["hole_id"]: int(p["par_strokes"]) for p in active_pars}

    # Build per-player net scores
    player_rows = []
    for reg in accepted:
        u = next((u for u in users if u["user_id"] == reg["user_id"]), {})
        handicap = next(
            (h for h in all_handicaps
             if h["user_id"] == reg["user_id"]
             and str(h.get("active_from", ""))[:10] <= start_date <= str(h.get("active_to", ""))[:10]),
            None,
        )
        player_scores = [s for s in all_scores if s["registration_id"] == reg["registration_id"]]
        gross = sum(int(s["strokes"]) for s in player_scores)
        net = gross - int(handicap["strokes"] if handicap else 0)
        player_rows.append({
            "name": f"{u.get('first_name', '')} {u.get('last_name', '')}".strip(),
            "user_id": reg["user_id"],
            "gross": gross,
            "net": net,
            "forfeit": reg["status"] == "forfeit",
            "scores": player_scores,
        })

    active_rows = [r for r in player_rows if not r["forfeit"] and r["gross"] > 0]
    active_rows.sort(key=lambda r: r["net"])

    champion = None
    tightest_finish_gap = None
    if active_rows:
        champion = {"name": active_rows[0]["name"], "net_score": active_rows[0]["net"]}
        if len(active_rows) >= 2:
            tightest_finish_gap = active_rows[1]["net"] - active_rows[0]["net"]

    # Best single-round score (lowest gross for one round)
    best_round = None
    for reg in accepted:
        for rnd in rounds:
            round_scores = [s for s in all_scores
                            if s["registration_id"] == reg["registration_id"] and s["round_id"] == rnd["round_id"]]
            if round_scores:
                total = sum(int(s["strokes"]) for s in round_scores)
                u = next((u for u in users if u["user_id"] == reg["user_id"]), {})
                name = f"{u.get('first_name', '')} {u.get('last_name', '')}".strip()
                if best_round is None or total < best_round["strokes"]:
                    best_round = {
                        "player_name": name,
                        "strokes": total,
                        "round_label": rnd.get("label") or f"Round {rnd['round_number']}",
                    }

    # Hardest hole (highest avg vs par across all players)
    hole_totals: dict[str, list[int]] = {}
    for s in all_scores:
        if s["registration_id"] in {r["registration_id"] for r in accepted}:
            hid = s["hole_id"]
            if hid not in hole_totals:
                hole_totals[hid] = []
            hole_totals[hid].append(int(s["strokes"]))

    hardest_hole = None
    worst_avg_vs_par = None
    for hid, stroke_list in hole_totals.items():
        par = par_map.get(hid)
        if par and stroke_list:
            avg = sum(stroke_list) / len(stroke_list)
            avg_vs_par = round(avg - par, 2)
            if worst_avg_vs_par is None or avg_vs_par > worst_avg_vs_par:
                worst_avg_vs_par = avg_vs_par
                # Get hole number
                all_holes = sheets.get_all_holes()
                hole = next((h for h in all_holes if h["hole_id"] == hid), {})
                hardest_hole = {"hole_number": hole.get("hole_number"), "avg_vs_par": avg_vs_par}

    return {
        "tournament_id": tournament_id,
        "tournament_name": t["name"],
        "champion": champion,
        "tightest_finish_gap": tightest_finish_gap,
        "best_round": best_round,
        "hardest_hole": hardest_hole,
    }


class AnnounceRequest(BaseModel):
    subject: str
    message: str


@router.post("/{tournament_id}/announce")
def announce(
    tournament_id: str,
    body: AnnounceRequest,
    current_user: dict = Depends(get_current_user),
):
    from dependencies import require_tournament_admin
    require_tournament_admin(tournament_id, current_user)

    t = sheets.get_tournament_by_id(tournament_id)
    if not t:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tournament not found")

    registrations = sheets.get_registrations_by_tournament(tournament_id)
    accepted = [r for r in registrations if r["status"] == "accepted"]

    sent = 0
    for reg in accepted:
        user = sheets.get_user_by_id(reg["user_id"])
        if user and user.get("email"):
            ok = email_utils.send_email(user["email"], body.subject, body.message)
            if ok:
                sent += 1

    return {"sent": sent}


@router.get("/admin/stats")
def admin_stats(current_user: dict = Depends(require_admin)):
    """At-a-glance stats for the admin dashboard."""
    all_regs = sheets.get_all_registrations()
    pending_registrations = sum(1 for r in all_regs if r["status"] == "in_review")

    all_tournaments = [t for t in sheets.get_all_tournaments() if not t.get("deleted_at")]
    from datetime import date
    today = date.today().isoformat()
    active_tournaments = sum(
        1 for t in all_tournaments
        if t.get("start_date", "") <= today <= t.get("end_date", "")
    )

    all_scores = sheets.get_all_scores()
    last_score_submitted_at = None
    if all_scores:
        submitted_ats = [s.get("submitted_at") or s.get("last_modified_at", "") for s in all_scores]
        submitted_ats = [s for s in submitted_ats if s]
        if submitted_ats:
            last_score_submitted_at = max(submitted_ats)

    pending_handicap_requests = sum(
        1 for r in sheets.get_all_handicap_requests()
        if r.get("status") == "pending"
    )

    upcoming_active_tournaments = sum(
        1 for t in all_tournaments
        if t.get("end_date", "") >= today
    )

    all_users = sheets.get_all_users()
    invited_users = sum(
        1 for u in all_users
        if not u.get("password_hash") and u.get("status") != "inactive"
    )

    return {
        "pending_registrations": pending_registrations,
        "active_tournaments": active_tournaments,
        "upcoming_active_tournaments": upcoming_active_tournaments,
        "last_score_submitted_at": last_score_submitted_at,
        "pending_handicap_requests": pending_handicap_requests,
        "invited_users": invited_users,
    }
