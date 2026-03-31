from pydantic import BaseModel, field_validator


class User(BaseModel):
    user_id: str
    first_name: str
    last_name: str
    email: str
    phone: str = ""
    role: str
    status: str = "active"  # active | inactive
    created_at: str
    invite_pending: bool = False  # True when password_hash is empty (invite not yet accepted)

    # Excluded from responses: password_hash, invite_token
    model_config = {"extra": "ignore"}

    @field_validator("phone", mode="before")
    @classmethod
    def coerce_phone_to_str(cls, v):
        if v is None or v == "":
            return ""
        return str(v)
