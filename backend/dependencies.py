"""FastAPI dependency functions for authentication and authorization."""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

import auth
import sheets

bearer_scheme = HTTPBearer()
bearer_scheme_optional = HTTPBearer(auto_error=False)


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> dict:
    try:
        payload = auth.decode_access_token(credentials.credentials)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    user = sheets.get_user_by_id(payload["sub"])
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    # Attach role from token (not re-fetched from sheet per request)
    user["role"] = payload["role"]
    return user


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme_optional),
) -> dict | None:
    """Like get_current_user but returns None instead of 401 when no token is present."""
    if not credentials:
        return None
    try:
        payload = auth.decode_access_token(credentials.credentials)
    except Exception:
        return None
    user = sheets.get_user_by_id(payload["sub"])
    if not user:
        return None
    user["role"] = payload["role"]
    return user


def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


def require_tournament_admin(tournament_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    """Require that user is the tournament admin or a global admin."""
    if current_user.get("role") == "admin":
        return current_user
    tournament = sheets.get_tournament_by_id(tournament_id)
    if not tournament:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tournament not found")
    if tournament.get("tournament_admin_id") != current_user["user_id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tournament admin access required")
    return current_user
