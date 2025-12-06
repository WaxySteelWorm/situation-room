"""SSO/OIDC authentication service."""

import secrets
import logging
from datetime import datetime
from typing import Optional
from dataclasses import dataclass, field
from urllib.parse import urlencode

import httpx

from ..config import get_config, OIDCProviderConfig

logger = logging.getLogger(__name__)


@dataclass
class OIDCProviderInfo:
    """Cached OIDC provider information."""
    authorization_endpoint: str
    token_endpoint: str
    userinfo_endpoint: str


@dataclass
class SSOService:
    """Service for handling SSO/OIDC authentication."""

    # Cache for OIDC discovery results
    _provider_cache: dict[str, OIDCProviderInfo] = field(default_factory=dict)
    # Store for state tokens (state -> provider_name)
    _state_tokens: dict[str, tuple[str, datetime]] = field(default_factory=dict)

    def __post_init__(self):
        if self._provider_cache is None:
            self._provider_cache = {}
        if self._state_tokens is None:
            self._state_tokens = {}

    def get_providers(self) -> list[dict]:
        """Get list of enabled SSO providers for the login page."""
        config = get_config()
        if not config.sso.enabled:
            return []

        providers = []
        for provider in config.sso.providers:
            if provider.client_id:  # Only include configured providers
                providers.append({
                    "name": provider.name,
                    "id": provider.name.lower().replace(" ", "_"),
                })
        return providers

    async def _get_provider_info(self, provider: OIDCProviderConfig) -> OIDCProviderInfo:
        """Get OIDC provider endpoints, using discovery if available."""
        cache_key = provider.name

        if cache_key in self._provider_cache:
            return self._provider_cache[cache_key]

        if provider.discovery_url:
            # Fetch from discovery endpoint
            async with httpx.AsyncClient() as client:
                response = await client.get(provider.discovery_url)
                response.raise_for_status()
                data = response.json()

            info = OIDCProviderInfo(
                authorization_endpoint=data["authorization_endpoint"],
                token_endpoint=data["token_endpoint"],
                userinfo_endpoint=data.get("userinfo_endpoint", ""),
            )
        else:
            # Use manually configured endpoints
            info = OIDCProviderInfo(
                authorization_endpoint=provider.authorization_url,
                token_endpoint=provider.token_url,
                userinfo_endpoint=provider.userinfo_url,
            )

        self._provider_cache[cache_key] = info
        return info

    def _get_provider_by_name(self, provider_name: str) -> Optional[OIDCProviderConfig]:
        """Get provider config by name."""
        config = get_config()
        provider_id = provider_name.lower().replace(" ", "_")

        for provider in config.sso.providers:
            if provider.name.lower().replace(" ", "_") == provider_id:
                return provider
        return None

    async def get_authorization_url(
        self, provider_name: str, redirect_uri: str
    ) -> Optional[str]:
        """Generate the authorization URL for initiating SSO login."""
        provider = self._get_provider_by_name(provider_name)
        if not provider:
            return None

        try:
            info = await self._get_provider_info(provider)
        except Exception as e:
            logger.error(f"Failed to get provider info for {provider_name}: {e}")
            return None

        # Generate state token
        state = secrets.token_urlsafe(32)
        self._state_tokens[state] = (provider_name, datetime.utcnow())

        # Clean up old state tokens (older than 10 minutes)
        self._cleanup_state_tokens()

        # Build authorization URL
        params = {
            "client_id": provider.client_id,
            "response_type": "code",
            "scope": " ".join(provider.scopes),
            "redirect_uri": redirect_uri,
            "state": state,
        }

        return f"{info.authorization_endpoint}?{urlencode(params)}"

    def _cleanup_state_tokens(self) -> None:
        """Remove expired state tokens."""
        now = datetime.utcnow()
        expired = [
            state for state, (_, created) in self._state_tokens.items()
            if (now - created).total_seconds() > 600  # 10 minutes
        ]
        for state in expired:
            del self._state_tokens[state]

    def validate_state(self, state: str) -> Optional[str]:
        """Validate a state token and return the provider name."""
        if state not in self._state_tokens:
            return None

        provider_name, created = self._state_tokens[state]

        # Check if expired (10 minutes)
        if (datetime.utcnow() - created).total_seconds() > 600:
            del self._state_tokens[state]
            return None

        # Remove used state token
        del self._state_tokens[state]
        return provider_name

    async def exchange_code(
        self, provider_name: str, code: str, redirect_uri: str
    ) -> Optional[dict]:
        """Exchange authorization code for tokens and get user info."""
        provider = self._get_provider_by_name(provider_name)
        if not provider:
            return None

        try:
            info = await self._get_provider_info(provider)
        except Exception as e:
            logger.error(f"Failed to get provider info: {e}")
            return None

        # Exchange code for tokens
        async with httpx.AsyncClient() as client:
            try:
                token_response = await client.post(
                    info.token_endpoint,
                    data={
                        "grant_type": "authorization_code",
                        "client_id": provider.client_id,
                        "client_secret": provider.client_secret,
                        "code": code,
                        "redirect_uri": redirect_uri,
                    },
                    headers={"Accept": "application/json"},
                )
                token_response.raise_for_status()
                tokens = token_response.json()
            except Exception as e:
                logger.error(f"Failed to exchange code for tokens: {e}")
                return None

            # Get user info
            access_token = tokens.get("access_token")
            if not access_token:
                logger.error("No access token in response")
                return None

            try:
                userinfo_response = await client.get(
                    info.userinfo_endpoint,
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                userinfo_response.raise_for_status()
                userinfo = userinfo_response.json()
            except Exception as e:
                logger.error(f"Failed to get user info: {e}")
                return None

        # Extract user data using claim mappings
        email = userinfo.get(provider.email_claim)
        name = userinfo.get(provider.name_claim, email)

        if not email:
            logger.error("No email in user info")
            return None

        # Check allowed domains
        config = get_config()
        if config.sso.allowed_domains:
            domain = email.split("@")[1] if "@" in email else ""
            if domain not in config.sso.allowed_domains:
                logger.warning(f"Email domain {domain} not in allowed domains")
                return None

        return {
            "email": email,
            "name": name,
            "provider": provider_name,
        }


# Global singleton instance
_sso_service: Optional[SSOService] = None


def get_sso_service() -> SSOService:
    """Get the global SSO service instance."""
    global _sso_service
    if _sso_service is None:
        _sso_service = SSOService(_provider_cache={}, _state_tokens={})
    return _sso_service
