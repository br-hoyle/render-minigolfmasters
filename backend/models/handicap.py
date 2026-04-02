from pydantic import BaseModel, field_validator


class Handicap(BaseModel):
    handicap_id: str
    user_id: str
    strokes: int
    active_from: str
    active_to: str

    model_config = {"extra": "ignore"}

    @field_validator("strokes", mode="before")
    @classmethod
    def coerce_strokes(cls, v):
        if v == "" or v is None:
            return 0
        return int(v)
