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


class FeaturesConfig(BaseModel):
    monitoring_enabled: bool = False
    ansible_enabled: bool = False
    websocket_agents_enabled: bool = False


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
    features: FeaturesConfig = FeaturesConfig()


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

    _config = config
    return config


def get_config() -> Config:
    """Get the loaded configuration."""
    global _config
    if _config is None:
        return load_config()
    return _config
