"""Authentication API routes."""

from typing import Optional
from fastapi import APIRouter, HTTPException, Response, Cookie, Depends, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from ..config import get_config
from ..services.auth import get_auth_service, Session
from ..services.sso import get_sso_service


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
    """Authenticate a user with username/password and create a session."""
    config = get_config()

    # Check if password login is allowed
    if config.sso.enabled and not config.sso.allow_password_login:
        raise HTTPException(
            status_code=403,
            detail="Password login is disabled. Please use SSO."
        )

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


# SSO Endpoints


class SSOProviderResponse(BaseModel):
    name: str
    id: str


class AuthConfigResponse(BaseModel):
    sso_enabled: bool
    allow_password_login: bool
    providers: list[SSOProviderResponse]


@router.get("/config", response_model=AuthConfigResponse)
async def get_auth_config():
    """Get authentication configuration for the login page."""
    config = get_config()
    sso_service = get_sso_service()

    providers = sso_service.get_providers()

    return AuthConfigResponse(
        sso_enabled=config.sso.enabled,
        allow_password_login=config.sso.allow_password_login if config.sso.enabled else True,
        providers=[SSOProviderResponse(**p) for p in providers],
    )


@router.get("/sso/{provider}/authorize")
async def sso_authorize(provider: str, request: Request):
    """Initiate SSO login by redirecting to the provider's authorization page."""
    config = get_config()
    if not config.sso.enabled:
        raise HTTPException(status_code=404, detail="SSO is not enabled")

    sso_service = get_sso_service()

    # Build redirect URI
    scheme = "https" if config.https.enabled else "http"
    host = request.headers.get("host", config.https.domain)
    redirect_uri = f"{scheme}://{host}/api/auth/sso/{provider}/callback"

    auth_url = await sso_service.get_authorization_url(provider, redirect_uri)

    if not auth_url:
        raise HTTPException(status_code=404, detail=f"Provider '{provider}' not found")

    return RedirectResponse(url=auth_url)


@router.get("/sso/{provider}/callback")
async def sso_callback(
    provider: str,
    request: Request,
    response: Response,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
):
    """Handle the OAuth callback from the SSO provider."""
    config = get_config()
    if not config.sso.enabled:
        raise HTTPException(status_code=404, detail="SSO is not enabled")

    # Handle error from provider
    if error:
        return RedirectResponse(url=f"/login?error={error}")

    if not code or not state:
        return RedirectResponse(url="/login?error=invalid_callback")

    sso_service = get_sso_service()

    # Validate state token
    validated_provider = sso_service.validate_state(state)
    if not validated_provider:
        return RedirectResponse(url="/login?error=invalid_state")

    # Build redirect URI (must match the one used in authorize)
    scheme = "https" if config.https.enabled else "http"
    host = request.headers.get("host", config.https.domain)
    redirect_uri = f"{scheme}://{host}/api/auth/sso/{provider}/callback"

    # Exchange code for user info
    user_info = await sso_service.exchange_code(provider, code, redirect_uri)

    if not user_info:
        return RedirectResponse(url="/login?error=authentication_failed")

    # Find or create user
    auth_service = get_auth_service()
    email = user_info["email"]
    name = user_info["name"]

    # Check if user exists in config
    user = auth_service.get_user_by_email(email)

    if not user:
        if config.sso.auto_create_users:
            # Create session for new user
            session = auth_service.create_sso_session(
                email=email,
                name=name,
                role=config.sso.default_role,
            )
        else:
            return RedirectResponse(url="/login?error=user_not_authorized")
    else:
        # Create session for existing user
        session = auth_service.create_session_for_user(user)

    if not session:
        return RedirectResponse(url="/login?error=session_creation_failed")

    # Set session cookie
    response = RedirectResponse(url="/")
    response.set_cookie(
        key="session_id",
        value=session.session_id,
        httponly=True,
        secure=config.https.enabled,
        samesite="lax",
        max_age=None,
    )

    return response
