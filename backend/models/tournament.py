from pydantic import BaseModel, field_validator, model_validator

from dates import today_local


def tournament_status(start_date, end_date) -> str:
    """"upcoming" | "active" | "complete", from the tournament's dates.

    Status is NOT a database column — it only exists once computed here.
    Anything holding a raw tournament row from sheets.py must call this
    rather than reading row["status"], which is never there.

    "Today" is the date where the tournament is played, not the server's
    UTC date — otherwise an evening round locks at 6pm Central when UTC
    rolls over to the next day.
    """
    today = today_local()
    start = str(start_date or "")[:10]
    end = str(end_date or "")[:10]
    if end and end < today:
        return "complete"
    if start and start > today:
        return "upcoming"
    return "active"


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
        self.status = tournament_status(self.start_date, self.end_date)
        return self

    @field_validator("entry_fee", "max_players", "registration_deadline", mode="before")
    @classmethod
    def coerce_to_str(cls, v):
        if v is None or v == "":
            return ""
        return str(v)
