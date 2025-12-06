"""Authentication API routes."""

from typing import Optional
from fastapi import APIRouter, HTTPException, Response, Cookie, Depends
from pydantic import BaseModel

from ..config import get_config
from ..services.auth import get_auth_service, Session


router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    username: str
    email: str
    role: str
    message: str


class UserResponse(BaseModel):
    username: str
    email: str
    role: str
    vault_unlocked: bool


async def get_current_session(
    session_id: Optional[str] = Cookie(None, alias="session_id")
) -> Session:
    """Dependency to get and validate the current session."""
    if not session_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    auth_service = get_auth_service()
    session = auth_service.get_session(session_id)

    if session is None:
        raise HTTPException(status_code=401, detail="Session expired or invalid")

    return session


async def get_optional_session(
    session_id: Optional[str] = Cookie(None, alias="session_id")
) -> Optional[Session]:
    """Dependency to get the current session if it exists."""
    if not session_id:
        return None

    auth_service = get_auth_service()
    return auth_service.get_session(session_id)


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest, response: Response):
    """
    Authenticate a user and create a session.

    SSO Extension Notes:
    - This endpoint can be extended to support SSO by:
      1. Adding a 'provider' field to the request
      2. Implementing OAuth callback handling in a separate endpoint
      3. The session management remains the same
    """
    auth_service = get_auth_service()
    session = auth_service.authenticate(request.username, request.password)

    if session is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    # Set session cookie
    # Only use secure cookies when HTTPS is enabled
    config = get_config()
    response.set_cookie(
        key="session_id",
        value=session.session_id,
        httponly=True,
        secure=config.https.enabled,
        samesite="lax",  # Allow cookie on same-site navigation
        max_age=None,  # Session cookie (expires when browser closes)
    )

    return LoginResponse(
        username=session.username,
        email=session.email,
        role=session.role,
        message="Login successful",
    )


@router.post("/logout")
async def logout(
    response: Response,
    session_id: Optional[str] = Cookie(None, alias="session_id"),
):
    """Log out the current user."""
    if session_id:
        auth_service = get_auth_service()
        auth_service.invalidate_session(session_id)

    response.delete_cookie(key="session_id")
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserResponse)
async def get_current_user(session: Session = Depends(get_current_session)):
    """Get the current authenticated user."""
    return UserResponse(
        username=session.username,
        email=session.email,
        role=session.role,
        vault_unlocked=session.vault_key is not None,
    )


@router.post("/refresh")
async def refresh_session(session: Session = Depends(get_current_session)):
    """Refresh the current session (updates last activity)."""
    # The get_current_session dependency already updates last_activity
    return {"message": "Session refreshed"}
