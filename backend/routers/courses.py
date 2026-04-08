import math
import statistics
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

import sheets
from dependencies import require_admin
from models.course import Course
from models.hole import Hole

router = APIRouter()


class CreateCourseRequest(BaseModel):
    name: str
    address: str = ""
    description: str = ""


class CreateHoleRequest(BaseModel):
    course_id: str
    hole_number: int


class UpdateHoleRequest(BaseModel):
    hole_number: int


class UpdateCourseRequest(BaseModel):
    name: str | None = None
    address: str | None = None
    description: str | None = None


@router.get("/", response_model=list[Course])
def list_courses():
    return [Course(**c) for c in sheets.get_all_courses() if not c.get("deleted_at")]


@router.get("/{course_id}", response_model=Course)
def get_course(course_id: str):
    c = sheets.get_course_by_id(course_id)
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    return Course(**c)


@router.get("/{course_id}/holes", response_model=list[Hole])
def list_holes(course_id: str):
    return [Hole(**h) for h in sheets.get_holes_by_course(course_id)]


@router.post("/", response_model=Course, status_code=status.HTTP_201_CREATED)
def create_course(body: CreateCourseRequest, _: dict = Depends(require_admin)):
    course_id = str(uuid.uuid4())
    row = {
        "course_id": course_id,
        "name": body.name,
        "address": body.address,
        "description": body.description,
    }
    sheets.insert_course(row)
    return Course(**row)


@router.post("/holes", response_model=Hole, status_code=status.HTTP_201_CREATED)
def create_hole(body: CreateHoleRequest, _: dict = Depends(require_admin)):
    hole_id = str(uuid.uuid4())
    row = {
        "hole_id": hole_id,
        "course_id": body.course_id,
        "hole_number": int(body.hole_number),
    }
    sheets.insert_hole(row)
    return Hole(**row)


@router.patch("/holes/{hole_id}", response_model=Hole)
def update_hole(hole_id: str, body: UpdateHoleRequest, _: dict = Depends(require_admin)):
    holes = sheets.get_all_holes()
    h = next((h for h in holes if h["hole_id"] == hole_id), None)
    if not h:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hole not found")
    sheets.update_hole(hole_id, {"hole_number": int(body.hole_number)})
    h["hole_number"] = int(body.hole_number)
    return Hole(**h)


@router.delete("/holes/{hole_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_hole(hole_id: str, _: dict = Depends(require_admin)):
    holes = sheets.get_all_holes()
    h = next((h for h in holes if h["hole_id"] == hole_id), None)
    if not h:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hole not found")
    sheets.delete_hole(hole_id)


@router.patch("/{course_id}", response_model=Course)
def update_course(course_id: str, body: UpdateCourseRequest, _: dict = Depends(require_admin)):
    c = sheets.get_course_by_id(course_id)
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    updates = body.model_dump(exclude_none=True)
    if updates:
        sheets.update_course(course_id, updates)
        c.update(updates)
    return Course(**c)


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_course(course_id: str, _: dict = Depends(require_admin)):
    from datetime import datetime, timezone
    c = sheets.get_course_by_id(course_id)
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    sheets.update_course(course_id, {"deleted_at": datetime.now(tz=timezone.utc).isoformat()})


@router.get("/{course_id}/analytics")
def get_course_analytics(course_id: str):
    """Return rich per-hole analytics + course summary for the public course detail page."""
    from collections import defaultdict
    import math

    holes = sheets.get_holes_by_course(course_id)
    if not holes:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found or has no holes")

    hole_ids = {h["hole_id"] for h in holes}

    all_pars = sheets.get_all_pars()
    active_pars = {
        p["hole_id"]: int(p["par_strokes"])
        for p in all_pars
        if str(p.get("active_to", ""))[:10] == "9999-12-31"
    }

    all_scores = sheets.get_all_scores()
    relevant = [s for s in all_scores if s["hole_id"] in hole_ids and s.get("strokes")]

    course_par = sum(active_pars.get(h["hole_id"], 0) for h in holes)

    # Per-hole stats
    hole_stats = []
    for hole in sorted(holes, key=lambda h: int(h["hole_number"])):
        hid = hole["hole_id"]
        par = active_pars.get(hid)
        scores = [int(s["strokes"]) for s in relevant if s["hole_id"] == hid]

        if not scores:
            hole_stats.append({
                "hole_id": hid, "hole_number": hole["hole_number"], "par": par,
                "avg_score": None, "vs_par": None, "ace_pct": None,
                "bogey_plus_pct": None, "std_dev": None, "separation_score": None,
                "difficulty_rank": None,
            })
            continue

        n = len(scores)
        avg = sum(scores) / n
        vs_par = (avg - par) if par is not None else None
        ace_pct = sum(1 for s in scores if s == 1) / n
        bogey_plus_pct = sum(1 for s in scores if par is not None and s > par) / n
        variance = sum((s - avg) ** 2 for s in scores) / n
        std_dev = math.sqrt(variance)
        separation_score = std_dev * abs(vs_par) if vs_par is not None else std_dev

        hole_stats.append({
            "hole_id": hid, "hole_number": hole["hole_number"], "par": par,
            "avg_score": round(avg, 3),
            "vs_par": round(vs_par, 3) if vs_par is not None else None,
            "ace_pct": round(ace_pct, 4),
            "bogey_plus_pct": round(bogey_plus_pct, 4),
            "std_dev": round(std_dev, 3),
            "separation_score": round(separation_score, 3),
            "difficulty_rank": None,
        })

    # Assign difficulty ranks (1 = hardest = highest vs_par)
    ranked = sorted([h for h in hole_stats if h["vs_par"] is not None], key=lambda h: h["vs_par"], reverse=True)
    for i, h in enumerate(ranked):
        h["difficulty_rank"] = i + 1

    # Course summary
    if relevant:
        round_totals = defaultdict(int)
        for s in relevant:
            round_totals[(s["round_id"], s["registration_id"])] += int(s["strokes"])
        round_total_list = list(round_totals.values())
        avg_round_score = sum(round_total_list) / len(round_total_list)
        vs_par_course = (avg_round_score - course_par) if course_par else None

        all_std_devs = [h["std_dev"] for h in hole_stats if h["std_dev"] is not None]
        volatility = sum(all_std_devs) / len(all_std_devs) if all_std_devs else None

        all_strokes = [int(s["strokes"]) for s in relevant]
        ace_rate = sum(1 for s in all_strokes if s == 1) / len(all_strokes)

        # Bogey rate: fraction of hole attempts scored above par
        par_by_hole = active_pars
        bogey_count = sum(
            1 for s in relevant
            if par_by_hole.get(s["hole_id"]) is not None and int(s["strokes"]) > par_by_hole[s["hole_id"]]
        )
        bogey_rate = bogey_count / len(relevant)

        course_summary = {
            "avg_score": round(avg_round_score, 2),
            "course_par": course_par,
            "vs_par": round(vs_par_course, 2) if vs_par_course is not None else None,
            "adjusted_difficulty": None,
            "ace_rate": round(ace_rate, 4),
            "bogey_rate": round(bogey_rate, 4),
            "volatility": round(volatility, 3) if volatility is not None else None,
            "sample_size": len(round_total_list),
            "total_hole_attempts": len(relevant),
        }
    else:
        course_summary = {
            "avg_score": None, "course_par": course_par, "vs_par": None,
            "adjusted_difficulty": None, "ace_rate": None, "bogey_rate": None,
            "volatility": None, "sample_size": 0, "total_hole_attempts": 0,
        }

    return {"course_summary": course_summary, "holes": hole_stats}


@router.get("/{course_id}/stats")
def get_course_stats(course_id: str):
    """Return per-hole difficulty stats: avg strokes and avg vs par."""
    holes = sheets.get_holes_by_course(course_id)
    if not holes:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found or has no holes")

    all_pars = sheets.get_all_pars()
    # Use always-active pars (active_to == 9999-12-31) as baseline
    active_pars = {p["hole_id"]: int(p["par_strokes"]) for p in all_pars if str(p.get("active_to", ""))[:10] == "9999-12-31"}

    all_scores = sheets.get_all_scores()
    hole_ids = {h["hole_id"] for h in holes}
    relevant_scores = [s for s in all_scores if s["hole_id"] in hole_ids]

    result = []
    for hole in sorted(holes, key=lambda h: int(h["hole_number"])):
        hid = hole["hole_id"]
        par = active_pars.get(hid)
        hole_scores = [int(s["strokes"]) for s in relevant_scores if s["hole_id"] == hid and s.get("strokes")]
        avg_strokes = round(sum(hole_scores) / len(hole_scores), 2) if hole_scores else None
        avg_vs_par = round(avg_strokes - par, 2) if avg_strokes is not None and par is not None else None
        result.append({
            "hole_id": hid,
            "hole_number": hole["hole_number"],
            "par": par,
            "avg_strokes": avg_strokes,
            "avg_vs_par": avg_vs_par,
            "score_count": len(hole_scores),
        })
    return result


@router.get("/{course_id}/analytics")
def get_course_analytics(course_id: str):
    """
    Return full course analytics: course summary cards + per-hole metrics.
    Public endpoint — no auth required.
    """
    holes = sheets.get_holes_by_course(course_id)
    if not holes:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found or has no holes")

    holes_sorted = sorted(holes, key=lambda h: int(h["hole_number"]))
    hole_ids = {h["hole_id"] for h in holes}

    # Use always-active pars as baseline (consistent with get_course_stats)
    all_pars = sheets.get_all_pars()
    active_pars = {
        p["hole_id"]: int(p["par_strokes"])
        for p in all_pars
        if str(p.get("active_to", ""))[:10] == "9999-12-31"
    }

    course_par = sum(active_pars.get(h["hole_id"], 0) for h in holes)

    # Get all rounds that use this course
    all_rounds = sheets.get_all_rounds()
    course_round_ids = {r["round_id"] for r in all_rounds if r.get("course_id") == course_id}

    if not course_round_ids:
        # No rounds played on this course yet
        return _empty_analytics(holes_sorted, active_pars, course_par)

    # Get all scores for those rounds
    all_scores = sheets.get_all_scores()
    course_scores = [
        s for s in all_scores
        if s.get("round_id") in course_round_ids and s.get("hole_id") in hole_ids and s.get("strokes")
    ]

    if not course_scores:
        return _empty_analytics(holes_sorted, active_pars, course_par)

    # Build per-(registration_id, round_id) round totals
    round_totals: dict[tuple, int] = {}
    for s in course_scores:
        key = (s["registration_id"], s["round_id"])
        round_totals[key] = round_totals.get(key, 0) + int(s["strokes"])

    round_total_values = list(round_totals.values())
    sample_size = len(round_total_values)
    total_hole_attempts = len(course_scores)

    # Course summary metrics
    avg_score = round(sum(round_total_values) / sample_size, 1) if sample_size else None
    vs_par = round(avg_score - course_par, 1) if avg_score is not None else None
    volatility = round(statistics.stdev(round_total_values), 1) if sample_size >= 2 else None

    ace_count = sum(1 for s in course_scores if int(s["strokes"]) == 1)
    ace_rate = round(ace_count / total_hole_attempts, 4) if total_hole_attempts else None

    # Adjusted difficulty: compare this course's score vs player's baseline on other rounds
    adjusted_difficulty = _compute_adjusted_difficulty(
        course_round_ids=course_round_ids,
        round_totals=round_totals,
        all_scores=all_scores,
        all_rounds=all_rounds,
        hole_ids=hole_ids,
    )

    # Per-hole metrics
    hole_analytics = _compute_hole_analytics(
        holes_sorted=holes_sorted,
        active_pars=active_pars,
        course_scores=course_scores,
        round_totals=round_totals,
    )

    return {
        "course_summary": {
            "course_par": course_par,
            "avg_score": avg_score,
            "vs_par": vs_par,
            "adjusted_difficulty": adjusted_difficulty,
            "ace_rate": ace_rate,
            "volatility": volatility,
            "sample_size": sample_size,
            "total_hole_attempts": total_hole_attempts,
        },
        "holes": hole_analytics,
    }


def _empty_analytics(holes_sorted, active_pars, course_par):
    """Return analytics structure with null metrics when no data exists."""
    return {
        "course_summary": {
            "course_par": course_par,
            "avg_score": None,
            "vs_par": None,
            "adjusted_difficulty": None,
            "ace_rate": None,
            "volatility": None,
            "sample_size": 0,
            "total_hole_attempts": 0,
        },
        "holes": [
            {
                "hole_id": h["hole_id"],
                "hole_number": int(h["hole_number"]),
                "par": active_pars.get(h["hole_id"]),
                "avg_score": None,
                "vs_par": None,
                "difficulty_rank": None,
                "ace_pct": None,
                "bogey_plus_pct": None,
                "std_dev": None,
                "separation_score": None,
            }
            for h in holes_sorted
        ],
    }


def _compute_adjusted_difficulty(
    course_round_ids: set,
    round_totals: dict,
    all_scores: list,
    all_rounds: list,
    hole_ids: set,
) -> float | None:
    """
    For each registration that played this course, compute their avg score on
    all OTHER rounds (at least 3), compare to their score on this course, and
    average the deltas.
    """
    # Map registration_id → list of non-course round scores
    other_round_ids = {r["round_id"] for r in all_rounds if r["round_id"] not in course_round_ids}

    # Build per-registration totals on other rounds
    other_totals: dict[str, list[int]] = {}
    for s in all_scores:
        if s.get("round_id") in other_round_ids and s.get("strokes"):
            reg_id = s["registration_id"]
            # Only sum scores from holes — group by round
            pass

    # More accurate: build (reg_id, round_id) → total for non-course rounds
    other_round_totals: dict[tuple, int] = {}
    for s in all_scores:
        if s.get("round_id") in other_round_ids and s.get("strokes"):
            key = (s["registration_id"], s["round_id"])
            other_round_totals[key] = other_round_totals.get(key, 0) + int(s["strokes"])

    # Group by registration_id
    reg_other_rounds: dict[str, list[int]] = {}
    for (reg_id, _round_id), total in other_round_totals.items():
        reg_other_rounds.setdefault(reg_id, []).append(total)

    # Build course score per registration (sum across all course rounds for that registration)
    reg_course_totals: dict[str, list[int]] = {}
    for (reg_id, round_id), total in round_totals.items():
        reg_course_totals.setdefault(reg_id, []).append(total)

    deltas = []
    for reg_id, course_round_scores in reg_course_totals.items():
        other_scores = reg_other_rounds.get(reg_id, [])
        if len(other_scores) < 3:
            continue
        player_baseline = sum(other_scores) / len(other_scores)
        course_avg = sum(course_round_scores) / len(course_round_scores)
        deltas.append(course_avg - player_baseline)

    if len(deltas) < 3:
        return None
    return round(sum(deltas) / len(deltas), 1)


def _compute_hole_analytics(
    holes_sorted: list,
    active_pars: dict,
    course_scores: list,
    round_totals: dict,
) -> list:
    """Compute per-hole analytics metrics."""
    # Group scores by hole_id
    scores_by_hole: dict[str, list[int]] = {}
    for s in course_scores:
        hid = s["hole_id"]
        scores_by_hole.setdefault(hid, []).append(int(s["strokes"]))

    # For separation score: split rounds into top/bottom quartile by total score
    round_total_values = sorted(round_totals.values())
    n = len(round_total_values)
    quartile_size = max(1, n // 4)
    top_keys = {k for k, v in round_totals.items() if v <= round_total_values[quartile_size - 1]}
    bottom_keys = {k for k, v in round_totals.items() if v >= round_total_values[n - quartile_size]}

    # Scores by hole for top/bottom quartile rounds
    top_scores_by_hole: dict[str, list[int]] = {}
    bottom_scores_by_hole: dict[str, list[int]] = {}
    for s in course_scores:
        key = (s["registration_id"], s["round_id"])
        hid = s["hole_id"]
        strokes = int(s["strokes"])
        if key in top_keys:
            top_scores_by_hole.setdefault(hid, []).append(strokes)
        if key in bottom_keys:
            bottom_scores_by_hole.setdefault(hid, []).append(strokes)

    # Compute vs_par for difficulty ranking
    hole_vs_par = {}
    for h in holes_sorted:
        hid = h["hole_id"]
        par = active_pars.get(hid)
        hole_scores = scores_by_hole.get(hid, [])
        if hole_scores and par is not None:
            avg = sum(hole_scores) / len(hole_scores)
            hole_vs_par[hid] = avg - par
        else:
            hole_vs_par[hid] = None

    # Dense rank by vs_par descending (1 = hardest)
    ranked_vs_par = sorted(
        [(hid, vp) for hid, vp in hole_vs_par.items() if vp is not None],
        key=lambda x: x[1],
        reverse=True,
    )
    rank_map = {}
    current_rank = 1
    prev_vp = None
    for i, (hid, vp) in enumerate(ranked_vs_par):
        if prev_vp is None or vp != prev_vp:
            current_rank = i + 1
        rank_map[hid] = current_rank
        prev_vp = vp

    result = []
    for h in holes_sorted:
        hid = h["hole_id"]
        par = active_pars.get(hid)
        hole_scores = scores_by_hole.get(hid, [])
        attempts = len(hole_scores)

        avg_score = round(sum(hole_scores) / attempts, 2) if attempts else None
        vp = hole_vs_par.get(hid)
        vs_par_display = round(vp, 2) if vp is not None else None
        difficulty_rank = rank_map.get(hid)

        ace_pct = round(sum(1 for s in hole_scores if s == 1) / attempts, 4) if attempts else None
        bogey_plus_pct = round(sum(1 for s in hole_scores if par is not None and s > par) / attempts, 4) if attempts and par is not None else None
        std_dev = round(statistics.stdev(hole_scores), 2) if attempts >= 2 else None

        # Separation score
        separation_score = None
        if n >= 4:
            top_hole = top_scores_by_hole.get(hid, [])
            bottom_hole = bottom_scores_by_hole.get(hid, [])
            if top_hole and bottom_hole:
                separation_score = round(
                    sum(bottom_hole) / len(bottom_hole) - sum(top_hole) / len(top_hole),
                    2,
                )

        result.append({
            "hole_id": hid,
            "hole_number": int(h["hole_number"]),
            "par": par,
            "avg_score": avg_score,
            "vs_par": vs_par_display,
            "difficulty_rank": difficulty_rank,
            "ace_pct": ace_pct,
            "bogey_plus_pct": bogey_plus_pct,
            "std_dev": std_dev,
            "separation_score": separation_score,
        })

    return result
