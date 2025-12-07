"""Configuration loader for Situation Room."""

import os
from pathlib import Path
from typing import Optional
import yaml
from pydantic import BaseModel


class ServerConfig(BaseModel):
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False


class HttpsConfig(BaseModel):
    enabled: bool = True
    domain: str = "localhost"
    email: str = "admin@example.com"
    cert_path: str = "/app/certs"


class DatabaseConfig(BaseModel):
    path: str = "/app/data/situation-room.db"


class SessionConfig(BaseModel):
    timeout_minutes: int = 15
    secret_key: str = "change-me-in-production"


class LoggingConfig(BaseModel):
    level: str = "info"


class UserConfig(BaseModel):
    username: str
    email: str
    password_hash: str
    role: str = "user"


class SmtpConfig(BaseModel):
    enabled: bool = False
    host: str = ""
    port: int = 587
    username: str = ""
    password: str = ""
    from_email: str = ""
    from_name: str = "Situation Room"
    use_tls: bool = True


class DiscordConfig(BaseModel):
    enabled: bool = False
    webhook_url: str = ""


class EncryptionConfig(BaseModel):
    salt: str = "change-me-in-production-32chars"


class OIDCProviderConfig(BaseModel):
    """Configuration for an OIDC/OAuth2 provider."""
    name: str  # Display name (e.g., "Google", "Microsoft")
    client_id: str = ""
    client_secret: str = ""
    # OIDC discovery URL (e.g., https://accounts.google.com/.well-known/openid-configuration)
    discovery_url: str = ""
    # Or manual endpoints if no discovery URL
    authorization_url: str = ""
    token_url: str = ""
    userinfo_url: str = ""
    # Scopes to request
    scopes: list[str] = ["openid", "email", "profile"]
    # Claim mappings
    email_claim: str = "email"
    name_claim: str = "name"


class SSOConfig(BaseModel):
    enabled: bool = False
    # Allow local password login alongside SSO
    allow_password_login: bool = True
    # Auto-create users on first SSO login (if False, user must exist in config)
    auto_create_users: bool = False
    # Default role for auto-created users
    default_role: str = "user"
    # Allowed email domains (empty = all allowed)
    allowed_domains: list[str] = []
    # OIDC providers
    providers: list[OIDCProviderConfig] = []


class FeaturesConfig(BaseModel):
    monitoring_enabled: bool = False
    ansible_enabled: bool = False
    websocket_agents_enabled: bool = False


class PrometheusConfig(BaseModel):
    """Configuration for Prometheus integration."""
    enabled: bool = False
    url: str = "http://localhost:9090"
    # No authentication by default (internal network)


class CloudflareRadarConfig(BaseModel):
    """Configuration for Cloudflare Radar BGP monitoring."""
    enabled: bool = False
    asn: int = 0  # Your AS number
    check_interval_minutes: int = 15
    # API key should be set via CLOUDFLARE_RADAR_API_KEY env var


class ObserviumConfig(BaseModel):
    """Configuration for Observium traffic monitoring."""
    enabled: bool = False
    url: str = "http://localhost/api/v0"
    username: str = "admin"
    password: str = "admin"
    interfaces: list[str] = []  # List of interface names to monitor (e.g., ["eth5"])


class NetworkConfig(BaseModel):
    """Configuration for network monitoring (BGP + Traffic)."""
    enabled: bool = False
    cloudflare_radar: CloudflareRadarConfig = CloudflareRadarConfig()
    observium: ObserviumConfig = ObserviumConfig()


class MonitoringConfig(BaseModel):
    """Configuration for the monitoring module."""
    enabled: bool = False
    # GeoIP database path (MaxMind GeoLite2)
    geoip_db_path: str = "/app/data/GeoLite2-City.mmdb"
    # Shared API key for agent authentication (agents use this to connect)
    agent_api_key: str = "change-me-in-production"
    # Data retention settings
    raw_event_retention_days: int = 30
    aggregate_retention_days: int = 365
    # Agent timeout (mark as stale/offline)
    agent_stale_threshold_minutes: int = 5
    agent_offline_threshold_minutes: int = 15
    # Prometheus integration
    prometheus: PrometheusConfig = PrometheusConfig()


class Config(BaseModel):
    server: ServerConfig = ServerConfig()
    https: HttpsConfig = HttpsConfig()
    database: DatabaseConfig = DatabaseConfig()
    session: SessionConfig = SessionConfig()
    logging: LoggingConfig = LoggingConfig()
    users: list[UserConfig] = []
    smtp: SmtpConfig = SmtpConfig()
    discord: DiscordConfig = DiscordConfig()
    encryption: EncryptionConfig = EncryptionConfig()
    sso: SSOConfig = SSOConfig()
    features: FeaturesConfig = FeaturesConfig()
    monitoring: MonitoringConfig = MonitoringConfig()
    network: NetworkConfig = NetworkConfig()


_config: Optional[Config] = None


def load_config(config_path: Optional[str] = None) -> Config:
    """Load configuration from YAML file and environment variables."""
    global _config

    if _config is not None:
        return _config

    # Determine config path
    if config_path is None:
        config_path = os.environ.get("SITUATION_ROOM_CONFIG", "/app/config.yml")

    config_data = {}

    # Load from file if exists
    if Path(config_path).exists():
        with open(config_path, "r") as f:
            config_data = yaml.safe_load(f) or {}

    # Create config object
    config = Config(**config_data)

    # Override with environment variables
    if os.environ.get("SITUATION_ROOM_SESSION_SECRET"):
        config.session.secret_key = os.environ["SITUATION_ROOM_SESSION_SECRET"]

    if os.environ.get("SITUATION_ROOM_ENCRYPTION_SALT"):
        config.encryption.salt = os.environ["SITUATION_ROOM_ENCRYPTION_SALT"]

    if os.environ.get("SITUATION_ROOM_DB_PATH"):
        config.database.path = os.environ["SITUATION_ROOM_DB_PATH"]

    if os.environ.get("SITUATION_ROOM_LOG_LEVEL"):
        config.logging.level = os.environ["SITUATION_ROOM_LOG_LEVEL"]

    if os.environ.get("SITUATION_ROOM_DISCORD_WEBHOOK"):
        config.discord.webhook_url = os.environ["SITUATION_ROOM_DISCORD_WEBHOOK"]
        config.discord.enabled = True

    if os.environ.get("SITUATION_ROOM_SMTP_HOST"):
        config.smtp.host = os.environ["SITUATION_ROOM_SMTP_HOST"]
        config.smtp.enabled = True

    if os.environ.get("SITUATION_ROOM_SMTP_PASSWORD"):
        config.smtp.password = os.environ["SITUATION_ROOM_SMTP_PASSWORD"]

    # Monitoring configuration overrides
    if os.environ.get("SITUATION_ROOM_MONITORING_ENABLED"):
        config.monitoring.enabled = os.environ["SITUATION_ROOM_MONITORING_ENABLED"].lower() == "true"

    if os.environ.get("SITUATION_ROOM_AGENT_API_KEY"):
        config.monitoring.agent_api_key = os.environ["SITUATION_ROOM_AGENT_API_KEY"]

    if os.environ.get("SITUATION_ROOM_GEOIP_DB_PATH"):
        config.monitoring.geoip_db_path = os.environ["SITUATION_ROOM_GEOIP_DB_PATH"]

    if os.environ.get("SITUATION_ROOM_PROMETHEUS_URL"):
        config.monitoring.prometheus.url = os.environ["SITUATION_ROOM_PROMETHEUS_URL"]
        config.monitoring.prometheus.enabled = True

    # Network monitoring configuration overrides
    if os.environ.get("SITUATION_ROOM_NETWORK_ENABLED"):
        config.network.enabled = os.environ["SITUATION_ROOM_NETWORK_ENABLED"].lower() == "true"

    # Auto-enable Cloudflare Radar if API key is set
    if os.environ.get("CLOUDFLARE_RADAR_API_KEY"):
        config.network.cloudflare_radar.enabled = True

    _config = config
    return config


def get_config() -> Config:
    """Get the loaded configuration."""
    global _config
    if _config is None:
        return load_config()
    return _config


# Store the Cloudflare API key separately (not in Pydantic model)
_cloudflare_radar_api_key: Optional[str] = None


def get_cloudflare_radar_api_key() -> Optional[str]:
    """Get the Cloudflare Radar API key from environment."""
    global _cloudflare_radar_api_key
    if _cloudflare_radar_api_key is None:
        _cloudflare_radar_api_key = os.environ.get("CLOUDFLARE_RADAR_API_KEY")
    return _cloudflare_radar_api_key
