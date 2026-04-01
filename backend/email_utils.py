"""
Centralized email utility for Mini Golf Masters.

Sends email via the Gmail API (OAuth2 + HTTPS) — Render's free tier blocks
outbound SMTP so raw TCP/SMTP is not an option.

Flow per send:
  1. POST oauth2.googleapis.com/token to exchange the long-lived refresh token
     for a short-lived access token (~1 hour).
  2. Build an RFC 2822 message with Python's email.mime module.
  3. Base64url-encode the raw message bytes.
  4. POST gmail.googleapis.com/gmail/v1/users/me/messages/send with the
     encoded payload and Bearer authorization.

All routers call send_email() from here; the signature is unchanged.
"""

import base64
import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from email.mime.text import MIMEText

from config import (
    GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET,
    GMAIL_FROM_EMAIL,
    GMAIL_REFRESH_TOKEN,
)

logger = logging.getLogger(__name__)

_TOKEN_URL = "https://oauth2.googleapis.com/token"
_SEND_URL  = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"


def _get_access_token() -> str:
    """Exchange the stored refresh token for a short-lived access token."""
    data = urllib.parse.urlencode({
        "client_id":     GMAIL_CLIENT_ID,
        "client_secret": GMAIL_CLIENT_SECRET,
        "refresh_token": GMAIL_REFRESH_TOKEN,
        "grant_type":    "refresh_token",
    }).encode()

    req = urllib.request.Request(
        _TOKEN_URL,
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())["access_token"]


def send_email(
    to_email: str,
    subject: str,
    body: str,
    reply_to: str | None = None,
) -> bool:
    """Send a plain-text email via the Gmail API. Returns True on success, False on failure."""
    try:
        access_token = _get_access_token()

        msg = MIMEText(body, "plain", "utf-8")
        msg["From"]    = GMAIL_FROM_EMAIL
        msg["To"]      = to_email
        msg["Subject"] = subject
        if reply_to:
            msg["Reply-To"] = reply_to

        # Gmail API requires base64url encoding
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()

        payload = json.dumps({"raw": raw}).encode()
        req = urllib.request.Request(
            _SEND_URL,
            data=payload,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type":  "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status == 200

    except urllib.error.HTTPError as e:
        body_text = e.read().decode(errors="replace")
        logger.error(
            "Gmail API HTTP error sending to=%s subject=%r: %s %s",
            to_email, subject, e.code, body_text,
        )
        return False
    except Exception as e:
        logger.error("Email send failed to=%s subject=%r: %s", to_email, subject, e)
        return False
