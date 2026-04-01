import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ["DATABASE_URL"]

JWT_SECRET_KEY = os.environ["JWT_SECRET_KEY"]
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
JWT_EXPIRY_HOURS = int(os.environ.get("JWT_EXPIRY_HOURS", 72))

ADMIN_EMAIL         = os.environ["ADMIN_EMAIL"]
GMAIL_CLIENT_ID     = os.environ["GMAIL_CLIENT_ID"]
GMAIL_CLIENT_SECRET = os.environ["GMAIL_CLIENT_SECRET"]
GMAIL_REFRESH_TOKEN = os.environ["GMAIL_REFRESH_TOKEN"]
GMAIL_FROM_EMAIL    = os.environ.get("GMAIL_FROM_EMAIL", "minigolfmasters.tournament@gmail.com")

ENVIRONMENT = os.environ.get("ENVIRONMENT", "development")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")
