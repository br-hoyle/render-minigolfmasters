#!/usr/bin/env python3
"""
One-time helper: obtain a Gmail OAuth2 refresh token for
minigolfmasters.tournament@gmail.com.

Usage:
    python backend/scripts/get_gmail_token.py

Prerequisites:
    1. Google Cloud Console → APIs & Services → Enable "Gmail API"
    2. OAuth consent screen → External → add your Gmail as a test user → Save
    3. Credentials → Create → OAuth client ID → Desktop app → Download JSON
    4. Place the downloaded JSON file in this directory (backend/scripts/)

The script will:
    - Read client_id / client_secret from the credentials JSON
    - Open your browser to the Google consent page
    - Start a local server on http://localhost:8080 to receive the redirect
    - Exchange the authorization code for tokens
    - Print the three values to copy into Render env vars
"""

import http.server
import json
import sys
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

REDIRECT_URI = "http://localhost:8080"
SCOPE        = "https://www.googleapis.com/auth/gmail.send"
AUTH_URL     = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL    = "https://oauth2.googleapis.com/token"

# ---------------------------------------------------------------------------
# Load credentials JSON
# ---------------------------------------------------------------------------

def load_credentials(path: str) -> tuple[str, str]:
    """Read client_id and client_secret from a downloaded OAuth JSON file."""
    with open(path) as f:
        data = json.load(f)
    # Google nests under "installed" for Desktop app credentials
    section = data.get("installed") or data.get("web")
    if not section:
        sys.exit(
            "ERROR: Unrecognised credentials JSON format.\n"
            "Download 'Desktop app' credentials from Google Cloud Console."
        )
    return section["client_id"], section["client_secret"]


def find_credentials_file() -> str:
    """Auto-discover a credentials JSON in the same directory as this script."""
    script_dir = Path(__file__).parent
    candidates = sorted(script_dir.glob("client_secret*.json"))
    if not candidates:
        candidates = sorted(script_dir.glob("*.json"))
    if not candidates:
        sys.exit(
            "ERROR: No credentials JSON found.\n"
            "Download 'Desktop app' credentials from Google Cloud Console and\n"
            f"place the JSON file in: {script_dir}"
        )
    path = str(candidates[0])
    print(f"Using credentials file: {path}")
    return path

# ---------------------------------------------------------------------------
# OAuth2 flow
# ---------------------------------------------------------------------------

def build_auth_url(client_id: str) -> str:
    params = urllib.parse.urlencode({
        "client_id":     client_id,
        "redirect_uri":  REDIRECT_URI,
        "response_type": "code",
        "scope":         SCOPE,
        "access_type":   "offline",   # required to receive a refresh_token
        "prompt":        "consent",   # forces refresh_token even if already authorized
    })
    return f"{AUTH_URL}?{params}"


class _AuthCodeHandler(http.server.BaseHTTPRequestHandler):
    """Minimal HTTP handler that captures ?code= from the OAuth redirect."""
    auth_code: str | None = None

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = dict(urllib.parse.parse_qsl(parsed.query))

        if "error" in params:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Authorization denied. You can close this tab.")
            _AuthCodeHandler.auth_code = None
            return

        if "code" in params:
            _AuthCodeHandler.auth_code = params["code"]
            self.send_response(200)
            self.end_headers()
            self.wfile.write(
                b"Authorization successful! You can close this tab and return to the terminal."
            )
        else:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Unexpected response - missing 'code' parameter.")

    def log_message(self, *args):
        pass  # suppress noisy server access log


def wait_for_auth_code() -> str:
    """Start a one-shot local HTTP server and block until the redirect arrives."""
    server = http.server.HTTPServer(("localhost", 8080), _AuthCodeHandler)
    print("Waiting for browser redirect on http://localhost:8080 ...")
    server.handle_request()  # blocks until exactly one request is received
    server.server_close()
    code = _AuthCodeHandler.auth_code
    if not code:
        sys.exit("ERROR: Did not receive an authorization code.")
    return code


def exchange_code_for_tokens(client_id: str, client_secret: str, code: str) -> dict:
    data = urllib.parse.urlencode({
        "code":          code,
        "client_id":     client_id,
        "client_secret": client_secret,
        "redirect_uri":  REDIRECT_URI,
        "grant_type":    "authorization_code",
    }).encode()
    req = urllib.request.Request(
        TOKEN_URL,
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    creds_path = sys.argv[1] if len(sys.argv) > 1 else find_credentials_file()
    client_id, client_secret = load_credentials(creds_path)

    auth_url = build_auth_url(client_id)

    print("\n--- Opening browser for Google authorization ---")
    opened = webbrowser.open(auth_url)
    if not opened:
        print("Could not open browser automatically. Visit this URL manually:")
        print(auth_url)

    code = wait_for_auth_code()
    print("Authorization code received. Exchanging for tokens...")

    tokens = exchange_code_for_tokens(client_id, client_secret, code)

    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        print("\nWARNING: No refresh_token returned by Google.")
        print("This happens if the app was previously authorized without 'prompt=consent'.")
        print("Fix: go to https://myaccount.google.com/permissions, revoke the app, then re-run.")
        print("\nFull token response:")
        print(json.dumps(tokens, indent=2))
        sys.exit(1)

    print("\n" + "=" * 60)
    print("SUCCESS! Add these to Render → minigolfmasters-api → Environment:")
    print("=" * 60)
    print(f"GMAIL_CLIENT_ID     = {client_id}")
    print(f"GMAIL_CLIENT_SECRET = {client_secret}")
    print(f"GMAIL_REFRESH_TOKEN = {refresh_token}")
    print("=" * 60)
    print("\nGMAIL_FROM_EMAIL is already set in render.yaml:")
    print("  minigolfmasters.tournament@gmail.com")


if __name__ == "__main__":
    main()
