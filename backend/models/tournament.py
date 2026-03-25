from pydantic import BaseModel


class Tournament(BaseModel):
    tournament_id: str
    name: str
    start_date: str
    end_date: str
    status: str  # upcoming | active | complete
    tournament_admin_id: str

    model_config = {"extra": "ignore"}
