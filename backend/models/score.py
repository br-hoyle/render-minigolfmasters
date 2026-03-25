from pydantic import BaseModel


class Score(BaseModel):
    score_id: str
    user_id: str
    registration_id: str
    round_id: str
    hole_id: str
    strokes: int
    submitted_at: str
    last_modified_by: str
    last_modified_at: str

    model_config = {"extra": "ignore"}
