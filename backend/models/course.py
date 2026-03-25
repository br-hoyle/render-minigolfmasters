from pydantic import BaseModel


class Course(BaseModel):
    course_id: str
    name: str
    address: str = ""
    description: str = ""

    model_config = {"extra": "ignore"}
