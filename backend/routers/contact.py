from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

import email_utils
from config import ADMIN_EMAIL

router = APIRouter()


class ContactRequest(BaseModel):
    name: str
    email: str
    phone: str
    subject: str
    message: str


@router.post("/", status_code=status.HTTP_204_NO_CONTENT)
def contact(body: ContactRequest):
    email_body = (
        f"From: {body.name} <{body.email}>\n"
        f"Phone: {body.phone}\n\n"
        f"{body.message}"
    )

    sent = email_utils.send_email(
        ADMIN_EMAIL,
        f"[Mini Golf Masters] {body.subject}",
        email_body,
        reply_to=body.email,
    )
    if not sent:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send message",
        )
