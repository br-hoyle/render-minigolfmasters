from pydantic import BaseModel


class Registration(BaseModel):
    registration_id: str
    tournament_id: str
    user_id: str
    status: str  # in_review | accepted | rejected | forfeit
    submitted_at: str

    model_config = {"extra": "ignore"}
