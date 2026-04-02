from pydantic import BaseModel, field_validator


class Par(BaseModel):
    par_id: str
    hole_id: str
    par_strokes: int
    active_from: str
    active_to: str

    model_config = {"extra": "ignore"}

    @field_validator("par_strokes", mode="before")
    @classmethod
    def coerce_par_strokes(cls, v):
        if v == "" or v is None:
            return 0
        return int(v)
