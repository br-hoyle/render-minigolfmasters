from pydantic import BaseModel, field_validator


class Hole(BaseModel):
    hole_id: str
    course_id: str
    hole_number: int

    model_config = {"extra": "ignore"}

    @field_validator("hole_number", mode="before")
    @classmethod
    def coerce_hole_number(cls, v):
        if v == "" or v is None:
            return 0
        return int(v)
