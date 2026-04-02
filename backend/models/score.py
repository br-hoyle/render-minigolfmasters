from pydantic import BaseModel, field_validator


class Score(BaseModel):
    score_id: str
    user_id: str
    registration_id: str
    round_id: str
    hole_id: str
    strokes: int
    submitted_at: str
    last_modified_by: str
    last_modified_at: str = ""
    version: int = 1

    model_config = {"extra": "ignore"}

    @field_validator("strokes", mode="before")
    @classmethod
    def coerce_strokes(cls, v):
        if v == "" or v is None:
            return 0
        return int(v)

    @field_validator("version", mode="before")
    @classmethod
    def coerce_version(cls, v):
        if v == "" or v is None:
            return 1
        return int(v)
