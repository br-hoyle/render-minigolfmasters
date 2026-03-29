from pydantic import BaseModel


class Handicap(BaseModel):
    handicap_id: str
    user_id: str
    strokes: int
    active_from: str
    active_to: str

    model_config = {"extra": "ignore"}
