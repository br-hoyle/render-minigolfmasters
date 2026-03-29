import smtplib
from email.mime.text import MIMEText

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from config import ADMIN_EMAIL, GMAIL_APP_PASSWORD

router = APIRouter()


class ContactRequest(BaseModel):
    name: str
    email: str
    subject: str
    message: str


@router.post("/", status_code=status.HTTP_204_NO_CONTENT)
def contact(body: ContactRequest):
    try:
        msg = MIMEText(
            f"From: {body.name} <{body.email}>\n\n{body.message}"
        )
        msg["Subject"] = f"[Mini Golf Masters] {body.subject}"
        msg["From"] = ADMIN_EMAIL
        msg["To"] = ADMIN_EMAIL
        msg["Reply-To"] = body.email

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
            smtp.login(ADMIN_EMAIL, GMAIL_APP_PASSWORD)
            smtp.send_message(msg)
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to send message")
