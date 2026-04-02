from pydantic import BaseModel, field_validator


class Round(BaseModel):
    round_id: str
    tournament_id: str
    course_id: str
    round_number: int
    label: str
    locked: str = ""

    model_config = {"extra": "ignore"}

    @field_validator("round_number", mode="before")
    @classmethod
    def coerce_round_number(cls, v):
        if v == "" or v is None:
            return 0
        return int(v)
