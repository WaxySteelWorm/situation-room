"""Alert configuration and history models."""

from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import DateTime, Float, Integer, String, Text, Boolean, Index, JSON
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class AlertSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class AlertType(str, Enum):
    # Host metrics alerts
    CPU_HIGH = "cpu_high"
    MEMORY_HIGH = "memory_high"
    DISK_HIGH = "disk_high"
    LOAD_HIGH = "load_high"
    HOST_DOWN = "host_down"
    # Threat alerts
    THREAT_SPIKE = "threat_spike"
    NEW_COUNTRY = "new_country"
    PORT_SCAN = "port_scan"
    # Agent alerts
    AGENT_OFFLINE = "agent_offline"


class NotificationChannel(str, Enum):
    DISCORD = "discord"
    EMAIL = "email"


class AlertRule(Base):
    """Configurable alert rules."""

    __tablename__ = "alert_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Rule identification
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    alert_type: Mapped[str] = mapped_column(String(50), nullable=False)

    # Rule configuration
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    severity: Mapped[str] = mapped_column(String(20), default=AlertSeverity.WARNING.value)

    # Thresholds (stored as JSON for flexibility)
    # e.g., {"threshold": 90, "duration_minutes": 5}
    conditions: Mapped[Optional[str]] = mapped_column(JSON, nullable=True)

    # Which hosts to monitor (null = all, or JSON list of hostnames/patterns)
    host_filter: Mapped[Optional[str]] = mapped_column(JSON, nullable=True)

    # Notification settings
    notify_discord: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_email: Mapped[bool] = mapped_column(Boolean, default=False)

    # Rate limiting
    cooldown_minutes: Mapped[int] = mapped_column(Integer, default=15)  # Don't re-alert within this window

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class AlertHistory(Base):
    """Log of all triggered alerts."""

    __tablename__ = "alert_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Alert reference
    rule_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # nullable for system alerts
    rule_name: Mapped[str] = mapped_column(String(100), nullable=False)
    alert_type: Mapped[str] = mapped_column(String(50), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)

    # Context
    hostname: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    details: Mapped[Optional[str]] = mapped_column(JSON, nullable=True)

    # Current value that triggered alert
    metric_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    threshold_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Notification status
    discord_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    email_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    notification_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Resolution tracking
    is_resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Timestamps
    triggered_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    __table_args__ = (
        Index('ix_alert_history_triggered_at', 'triggered_at'),
        Index('ix_alert_history_rule_id', 'rule_id'),
        Index('ix_alert_history_hostname', 'hostname'),
        Index('ix_alert_history_is_resolved', 'is_resolved'),
    )


class AlertSettings(Base):
    """Global alert settings."""

    __tablename__ = "alert_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Singleton key (only one row)
    key: Mapped[str] = mapped_column(String(50), unique=True, default="global")

    # Global enable/disable
    alerts_enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    # Notification channels
    discord_webhook_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    discord_enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    email_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    email_recipients: Mapped[Optional[str]] = mapped_column(JSON, nullable=True)  # List of emails

    # Default thresholds (can be overridden per rule)
    default_cpu_threshold: Mapped[float] = mapped_column(Float, default=90.0)
    default_memory_threshold: Mapped[float] = mapped_column(Float, default=95.0)
    default_disk_threshold: Mapped[float] = mapped_column(Float, default=90.0)
    default_load_threshold: Mapped[float] = mapped_column(Float, default=10.0)

    # Check interval
    check_interval_seconds: Mapped[int] = mapped_column(Integer, default=60)

    # Quiet hours (don't send notifications during these hours)
    quiet_hours_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    quiet_hours_start: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # 0-23
    quiet_hours_end: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # 0-23

    # Timestamps
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
