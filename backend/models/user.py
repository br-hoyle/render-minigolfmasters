from pydantic import BaseModel


class User(BaseModel):
    user_id: str
    first_name: str
    last_name: str
    email: str
    role: str
    created_at: str

    # Excluded from responses: password_hash, invite_token
    model_config = {"extra": "ignore"}
