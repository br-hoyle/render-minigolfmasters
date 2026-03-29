from pydantic import BaseModel


class Hole(BaseModel):
    hole_id: str
    course_id: str
    hole_number: int

    model_config = {"extra": "ignore"}
