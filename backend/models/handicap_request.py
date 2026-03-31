from pydantic import BaseModel


class HandicapRequest(BaseModel):
    request_id: str
    user_id: str
    requested_strokes: int
    message: str = ""
    status: str  # pending | approved | rejected
    submitted_at: str
    resolved_at: str = ""
    resolved_by: str = ""

    model_config = {"extra": "ignore"}
