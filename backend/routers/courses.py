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
