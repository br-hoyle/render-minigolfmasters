import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ["DATABASE_URL"]

JWT_SECRET_KEY = os.environ["JWT_SECRET_KEY"]
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
JWT_EXPIRY_HOURS = int(os.environ.get("JWT_EXPIRY_HOURS", 72))

ADMIN_EMAIL = os.environ["ADMIN_EMAIL"]
GMAIL_APP_PASSWORD = os.environ["GMAIL_APP_PASSWORD"]

ENVIRONMENT = os.environ.get("ENVIRONMENT", "development")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")
