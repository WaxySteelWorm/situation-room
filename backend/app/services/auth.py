"""Authentication service with in-memory session management."""

import secrets
from datetime import datetime, timedelta
from typing import Optional
from dataclasses import dataclass, field

import bcrypt

from ..config import get_config, UserConfig


@dataclass
class Session:
    """User session data."""

    session_id: str
    username: str
    email: str
    role: str
    created_at: datetime
    last_activity: datetime
    # Master password derived key (only set when vault is unlocked)
    vault_key: Optional[bytes] = None


@dataclass
class AuthService:
    """
    Authentication service with in-memory session management.

    Designed to be extensible for SSO/OAuth integration:
    - authenticate() can be extended to support external identity providers
    - Session management is abstracted and can be replaced with OAuth tokens
    - User lookup is decoupled from authentication method
    """

    # In-memory session storage
    _sessions: dict[str, Session] = field(default_factory=dict)

    def __post_init__(self):
        """Initialize sessions dict if not provided."""
        if self._sessions is None:
            self._sessions = {}

    def get_user_by_username(self, username: str) -> Optional[UserConfig]:
        """
        Get user configuration by username.

        This method is designed to be extended for SSO integration:
        - Can be overridden to fetch user from external identity provider
        - Currently reads from config file
        """
        config = get_config()
        for user in config.users:
            if user.username == username:
                return user
        return None

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verify a password against its hash."""
        return bcrypt.checkpw(
            plain_password.encode("utf-8"), hashed_password.encode("utf-8")
        )

    def authenticate(self, username: str, password: str) -> Optional[Session]:
        """
        Authenticate a user and create a session.

        SSO Extension Point:
        - This method can be extended to support OAuth/OIDC flows
        - For SSO, the password parameter would be replaced with an auth code/token
        - The method signature can remain the same with method overloading
        """
        user = self.get_user_by_username(username)
        if user is None:
            return None

        if not self.verify_password(password, user.password_hash):
            return None

        # Create session
        session_id = secrets.token_urlsafe(32)
        now = datetime.utcnow()

        session = Session(
            session_id=session_id,
            username=user.username,
            email=user.email,
            role=user.role,
            created_at=now,
            last_activity=now,
        )

        self._sessions[session_id] = session
        return session

    def get_session(self, session_id: str) -> Optional[Session]:
        """Get a session by ID, checking for expiration."""
        if session_id not in self._sessions:
            return None

        session = self._sessions[session_id]
        config = get_config()
        timeout = timedelta(minutes=config.session.timeout_minutes)

        # Check if session has expired due to inactivity
        if datetime.utcnow() - session.last_activity > timeout:
            self.invalidate_session(session_id)
            return None

        # Update last activity
        session.last_activity = datetime.utcnow()
        return session

    def invalidate_session(self, session_id: str) -> None:
        """Invalidate (logout) a session."""
        if session_id in self._sessions:
            del self._sessions[session_id]

    def set_vault_key(self, session_id: str, vault_key: bytes) -> bool:
        """Set the vault encryption key for a session."""
        session = self.get_session(session_id)
        if session is None:
            return False

        session.vault_key = vault_key
        return True

    def clear_vault_key(self, session_id: str) -> None:
        """Clear the vault encryption key (lock vault)."""
        session = self.get_session(session_id)
        if session:
            session.vault_key = None

    def get_all_sessions(self) -> list[Session]:
        """Get all active sessions (admin only)."""
        config = get_config()
        timeout = timedelta(minutes=config.session.timeout_minutes)
        now = datetime.utcnow()

        # Clean up expired sessions and return active ones
        active_sessions = []
        expired = []

        for session_id, session in self._sessions.items():
            if now - session.last_activity > timeout:
                expired.append(session_id)
            else:
                active_sessions.append(session)

        for session_id in expired:
            del self._sessions[session_id]

        return active_sessions


# Global singleton instance
_auth_service: Optional[AuthService] = None


def get_auth_service() -> AuthService:
    """Get the global auth service instance."""
    global _auth_service
    if _auth_service is None:
        _auth_service = AuthService(_sessions={})
    return _auth_service
