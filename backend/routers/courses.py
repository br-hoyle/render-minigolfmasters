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


@router.get("/", response_model=list[Course])
def list_courses():
    return [Course(**c) for c in sheets.get_all_courses()]


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
