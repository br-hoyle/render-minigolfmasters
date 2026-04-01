"""
Centralized email utility for Mini Golf Masters.

This is the only place that uses smtplib directly.
All routers call send_email() from here.
"""

import logging
import smtplib
from email.mime.text import MIMEText

from config import ADMIN_EMAIL, GMAIL_APP_PASSWORD

logger = logging.getLogger(__name__)


def send_email(to_email: str, subject: str, body: str, reply_to: str | None = None) -> bool:
    """Send a plain-text email. Returns True on success, False on failure."""
    try:
        msg = MIMEText(body)
        msg["Subject"] = subject
        msg["From"] = ADMIN_EMAIL
        msg["To"] = to_email
        if reply_to:
            msg["Reply-To"] = reply_to

        with smtplib.SMTP("smtp.gmail.com", 587, timeout=10) as smtp:
            smtp.starttls()
            smtp.login(ADMIN_EMAIL, GMAIL_APP_PASSWORD)
            smtp.send_message(msg)
        return True
    except Exception as e:
        logger.error("Email send failed to=%s subject=%r: %s", to_email, subject, e)
        return False
