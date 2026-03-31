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
