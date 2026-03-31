from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

import email_utils
from config import ADMIN_EMAIL

router = APIRouter()


class ContactRequest(BaseModel):
    name: str
    email: str
    subject: str
    message: str


@router.post("/", status_code=status.HTTP_204_NO_CONTENT)
def contact(body: ContactRequest):
    sent = email_utils.send_email(
        ADMIN_EMAIL,
        f"[Mini Golf Masters] {body.subject}",
        f"From: {body.name} <{body.email}>\n\n{body.message}",
        reply_to=body.email,
    )
    if not sent:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to send message")
