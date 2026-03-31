import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel

import sheets
from dependencies import require_admin
from models.par import Par

router = APIRouter()


class SetParRequest(BaseModel):
    hole_id: str
    par_strokes: int


@router.get("/", response_model=list[Par])
def list_pars(tournament_start_date: str | None = None):
    if tournament_start_date:
        return [Par(**p) for p in sheets.get_pars_for_date(tournament_start_date)]
    return [Par(**p) for p in sheets.get_all_pars()]


class BulkSetParRequest(BaseModel):
    pars: list[SetParRequest]


@router.post("/bulk", status_code=201)
def set_pars_bulk(body: BulkSetParRequest, _: dict = Depends(require_admin)):
    results = []
    for item in body.pars:
        now = datetime.now(tz=timezone.utc).isoformat()
        all_pars = sheets.get_all_pars()
        for p in all_pars:
            if p["hole_id"] == item.hole_id and p["active_to"] == "9999-12-31":
                sheets.close_par(p["par_id"], now)
        par_id = str(uuid.uuid4())
        row = {
            "par_id": par_id,
            "hole_id": item.hole_id,
            "par_strokes": item.par_strokes,
            "active_from": now,
            "active_to": "9999-12-31",
        }
        sheets.insert_par(row)
        results.append(Par(**row))
    return results


@router.post("/", response_model=Par, status_code=201)
def set_par(body: SetParRequest, _: dict = Depends(require_admin)):
    now = datetime.now(tz=timezone.utc).isoformat()

    # Close any existing active par for this hole
    all_pars = sheets.get_all_pars()
    for p in all_pars:
        if p["hole_id"] == body.hole_id and p["active_to"] == "9999-12-31":
            sheets.close_par(p["par_id"], now)

    par_id = str(uuid.uuid4())
    row = {
        "par_id": par_id,
        "hole_id": body.hole_id,
        "par_strokes": body.par_strokes,
        "active_from": now,
        "active_to": "9999-12-31",
    }
    sheets.insert_par(row)
    return Par(**row)
