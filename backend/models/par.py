from pydantic import BaseModel


class Par(BaseModel):
    par_id: str
    hole_id: str
    par_strokes: int
    active_from: str
    active_to: str

    model_config = {"extra": "ignore"}
