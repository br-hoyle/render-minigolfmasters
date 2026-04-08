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
        "hole_number": body.hole_number,
    }
    sheets.insert_hole(row)
    return Hole(**row)


@router.patch("/holes/{hole_id}", response_model=Hole)
def update_hole(hole_id: str, body: UpdateHoleRequest, _: dict = Depends(require_admin)):
    holes = sheets.get_all_holes()
    h = next((h for h in holes if h["hole_id"] == hole_id), None)
    if not h:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hole not found")
    sheets.update_hole(hole_id, {"hole_number": body.hole_number})
    h["hole_number"] = body.hole_number
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
