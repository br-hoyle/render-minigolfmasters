from pydantic import BaseModel


class Round(BaseModel):
    round_id: str
    tournament_id: str
    course_id: str
    round_number: int
    label: str
    locked: str = ""

    model_config = {"extra": "ignore"}
