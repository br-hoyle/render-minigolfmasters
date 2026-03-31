from datetime import date

from pydantic import BaseModel, field_validator, model_validator


class Tournament(BaseModel):
    tournament_id: str
    name: str
    start_date: str
    end_date: str
    status: str = ""  # computed from dates — not stored
    tournament_admin_id: str
    entry_fee: str = ""
    max_players: str = ""
    registration_deadline: str = ""
    deleted_at: str = ""

    model_config = {"extra": "ignore"}

    @model_validator(mode="after")
    def compute_status(self) -> "Tournament":
        today = date.today().isoformat()
        if self.end_date and self.end_date < today:
            self.status = "complete"
        elif self.start_date and self.start_date > today:
            self.status = "upcoming"
        else:
            self.status = "active"
        return self

    @field_validator("entry_fee", "max_players", "registration_deadline", mode="before")
    @classmethod
    def coerce_to_str(cls, v):
        if v is None or v == "":
            return ""
        return str(v)
