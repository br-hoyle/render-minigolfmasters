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
        "end_date": body.end_date or None,
        "tournament_admin_id": current_user["user_id"],
        "entry_fee": body.entry_fee or None,
        "max_players": body.max_players or None,
        "registration_deadline": body.registration_deadline or None,
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
    accepted_reg_ids = {r["registration_id"] for r in accepted}
    rounds = sheets.get_rounds_by_tournament(tournament_id)
    all_scores = sheets.get_all_scores()
    all_pars = sheets.get_all_pars()
    all_handicaps = sheets.get_all_handicaps()
    all_holes = sheets.get_all_holes()
    all_courses = sheets.get_all_courses()
    users = sheets.get_all_users()

    start_date = t.get("start_date", "")
    active_pars = [p for p in all_pars if str(p.get("active_from", ""))[:10] <= start_date <= str(p.get("active_to", ""))[:10]]
    if not active_pars:
        active_pars = [p for p in all_pars if str(p.get("active_to", ""))[:10] == "9999-12-31"]
    par_map = {p["hole_id"]: int(p["par_strokes"]) for p in active_pars}

    # Build hole → course lookup
    hole_course_map = {h["hole_id"]: h.get("course_id") for h in all_holes}
    course_name_map = {c["course_id"]: c.get("name", "") for c in all_courses}
    hole_number_map = {h["hole_id"]: h.get("hole_number") for h in all_holes}

    # Build round → course name lookup
    round_course_map = {}
    for rnd in rounds:
        cid = rnd.get("course_id")
        round_course_map[rnd["round_id"]] = course_name_map.get(cid, "")

    # Compute total par across all rounds
    round_hole_ids: dict[str, list[str]] = {}
    for rnd in rounds:
        course_holes = [h["hole_id"] for h in all_holes if h.get("course_id") == rnd.get("course_id")]
        round_hole_ids[rnd["round_id"]] = course_holes
    total_par = sum(par_map.get(hid, 0) for rnd in rounds for hid in round_hole_ids.get(rnd["round_id"], []))

    # Build per-player stats
    player_rows = []
    for reg in accepted:
        u = next((u for u in users if u["user_id"] == reg["user_id"]), {})
        handicap = next(
            (h for h in all_handicaps
             if h["user_id"] == reg["user_id"]
             and str(h.get("active_from", ""))[:10] <= start_date <= str(h.get("active_to", ""))[:10]),
            None,
        )
        handicap_strokes = int(handicap["strokes"]) if handicap else 0
        player_scores = [s for s in all_scores if s["registration_id"] == reg["registration_id"]]
        gross = sum(int(s["strokes"]) for s in player_scores)
        net = gross - handicap_strokes

        # Per-hole stats
        birdies = sum(1 for s in player_scores if par_map.get(s["hole_id"]) and int(s["strokes"]) == par_map[s["hole_id"]] - 1)
        bogeys = sum(1 for s in player_scores if par_map.get(s["hole_id"]) and int(s["strokes"]) == par_map[s["hole_id"]] + 1)
        hole_in_ones = [s for s in player_scores if int(s["strokes"]) == 1]

        # Over/under achievement: expected gross = total_par + handicap; positive = beat expectations
        over_achievement = (total_par + handicap_strokes) - gross if gross > 0 else None

        player_rows.append({
            "name": f"{u.get('first_name', '')} {u.get('last_name', '')}".strip(),
            "user_id": reg["user_id"],
            "gross": gross,
            "net": net,
            "handicap_strokes": handicap_strokes,
            "forfeit": reg["status"] == "forfeit",
            "scores": player_scores,
            "birdies": birdies,
            "bogeys": bogeys,
            "hole_in_ones": hole_in_ones,
            "over_achievement": over_achievement,
        })

    active_rows = [r for r in player_rows if not r["forfeit"] and r["gross"] > 0]
    active_rows.sort(key=lambda r: r["net"])

    # Top 3 with standard competition ranking
    podium = []
    for i, row in enumerate(active_rows[:3]):
        ahead = sum(1 for r in active_rows[:i] if r["net"] < row["net"])
        podium.append({
            "rank": ahead + 1,
            "name": row["name"],
            "net_score": row["net"],
            "gross_score": row["gross"],
        })

    champion = podium[0] if podium else None
    tightest_finish_gap = (active_rows[1]["net"] - active_rows[0]["net"]) if len(active_rows) >= 2 else None

    # Last place
    last_place = None
    if len(active_rows) > 1:
        last = active_rows[-1]
        last_place = {"name": last["name"], "net_score": last["net"], "gross_score": last["gross"]}

    # Best single-round score (lowest gross for one round) with vs-par
    best_round = None
    for reg in accepted:
        if reg["status"] == "forfeit":
            continue
        u = next((u for u in users if u["user_id"] == reg["user_id"]), {})
        name = f"{u.get('first_name', '')} {u.get('last_name', '')}".strip()
        for rnd in rounds:
            round_scores = [s for s in all_scores
                            if s["registration_id"] == reg["registration_id"] and s["round_id"] == rnd["round_id"]]
            if round_scores:
                total = sum(int(s["strokes"]) for s in round_scores)
                round_par = sum(par_map.get(hid, 0) for hid in round_hole_ids.get(rnd["round_id"], []))
                vs_par = total - round_par if round_par else None
                if best_round is None or total < best_round["strokes"]:
                    best_round = {
                        "player_name": name,
                        "strokes": total,
                        "vs_par": vs_par,
                        "round_label": rnd.get("label") or f"Round {rnd['round_number']}",
                        "course_name": round_course_map.get(rnd["round_id"], ""),
                    }

    # Hardest hole (highest avg vs par)
    hole_totals: dict[str, list[int]] = {}
    for s in all_scores:
        if s["registration_id"] in accepted_reg_ids:
            hid = s["hole_id"]
            hole_totals.setdefault(hid, []).append(int(s["strokes"]))

    hardest_hole = None
    worst_avg_vs_par = None
    for hid, stroke_list in hole_totals.items():
        par = par_map.get(hid)
        if par and stroke_list:
            avg = sum(stroke_list) / len(stroke_list)
            avg_vs_par = round(avg - par, 2)
            if worst_avg_vs_par is None or avg_vs_par > worst_avg_vs_par:
                worst_avg_vs_par = avg_vs_par
                cid = hole_course_map.get(hid)
                # Find which round this hole belongs to
                rnd_label = next(
                    (rnd.get("label") or f"Round {rnd['round_number']}" for rnd in rounds if rnd.get("course_id") == cid),
                    None,
                )
                hardest_hole = {
                    "hole_number": hole_number_map.get(hid),
                    "avg_vs_par": avg_vs_par,
                    "course_name": course_name_map.get(cid, ""),
                    "round_label": rnd_label,
                }

    # Most birdies player
    most_birdies = None
    if active_rows:
        top = max(active_rows, key=lambda r: r["birdies"])
        if top["birdies"] > 0:
            most_birdies = {"name": top["name"], "count": top["birdies"]}

    # Most bogeys player
    most_bogeys = None
    if active_rows:
        top = max(active_rows, key=lambda r: r["bogeys"])
        if top["bogeys"] > 0:
            most_bogeys = {"name": top["name"], "count": top["bogeys"]}

    # Hole-in-ones across all players
    hole_in_ones_list = []
    for row in active_rows:
        for s in row["hole_in_ones"]:
            hid = s["hole_id"]
            rnd = next((r for r in rounds if r["round_id"] == s.get("round_id")), {})
            hole_in_ones_list.append({
                "player_name": row["name"],
                "hole_number": hole_number_map.get(hid),
                "round_label": rnd.get("label") or f"Round {rnd.get('round_number', '?')}",
            })

    # Over-achiever (beat expectations by most)
    over_achiever = None
    under_achiever = None
    achievers = [r for r in active_rows if r["over_achievement"] is not None]
    if achievers:
        best = max(achievers, key=lambda r: r["over_achievement"])
        worst = min(achievers, key=lambda r: r["over_achievement"])
        over_achiever = {"name": best["name"], "over_achievement": best["over_achievement"]}
        if worst["user_id"] != best["user_id"]:
            under_achiever = {"name": worst["name"], "over_achievement": worst["over_achievement"]}

    return {
        "tournament_id": tournament_id,
        "tournament_name": t["name"],
        "podium": podium,
        "champion": champion,
        "tightest_finish_gap": tightest_finish_gap,
        "last_place": last_place,
        "best_round": best_round,
        "hardest_hole": hardest_hole,
        "most_birdies": most_birdies,
        "most_bogeys": most_bogeys,
        "hole_in_ones": hole_in_ones_list,
        "over_achiever": over_achiever,
        "under_achiever": under_achiever,
    }


VALID_ANNOUNCE_STATUSES = {"accepted", "in_review", "waitlisted", "rejected", "forfeit"}


class AnnounceRequest(BaseModel):
    subject: str
    message: str
    statuses: list[str] = ["accepted"]


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

    # Validate requested statuses
    requested_statuses = set(body.statuses) & VALID_ANNOUNCE_STATUSES
    if not requested_statuses:
        requested_statuses = {"accepted"}

    registrations = sheets.get_registrations_by_tournament(tournament_id)
    targets = [r for r in registrations if r["status"] in requested_statuses]

    sent = 0
    for reg in targets:
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
