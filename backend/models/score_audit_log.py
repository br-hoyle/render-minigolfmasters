from pydantic import BaseModel


class ScoreAuditLog(BaseModel):
    audit_id: str
    score_id: str
    previous_strokes: int
    new_strokes: int
    modified_by: str
    modified_at: str

    model_config = {"extra": "ignore"}
