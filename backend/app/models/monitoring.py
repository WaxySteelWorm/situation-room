"""Monitoring models for threat tracking and agent management."""

from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import DateTime, Float, Integer, String, Text, Boolean, Index
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class AgentStatus(str, Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    STALE = "stale"


class Agent(Base):
    """Remote monitoring agent registration."""

    __tablename__ = "monitoring_agents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    hostname: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    ip_address: Mapped[str] = mapped_column(String(45), nullable=False)  # IPv6 max length
    api_key_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    # Agent metadata
    version: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    os_info: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Status tracking
    status: Mapped[str] = mapped_column(String(20), default=AgentStatus.OFFLINE.value)
    last_seen: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Configuration
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    report_interval_seconds: Mapped[int] = mapped_column(Integer, default=60)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class ThreatEvent(Base):
    """Individual blocked connection event from UFW logs."""

    __tablename__ = "threat_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Source information
    agent_hostname: Mapped[str] = mapped_column(String(255), nullable=False)
    source_ip: Mapped[str] = mapped_column(String(45), nullable=False)
    source_port: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Destination information
    dest_ip: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    dest_port: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    protocol: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # TCP, UDP, ICMP

    # GeoIP data
    country_code: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    country_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Raw log data
    raw_log: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Timestamps
    event_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    __table_args__ = (
        Index('ix_threat_events_event_time', 'event_time'),
        Index('ix_threat_events_source_ip', 'source_ip'),
        Index('ix_threat_events_country_code', 'country_code'),
        Index('ix_threat_events_agent_hostname', 'agent_hostname'),
    )


class CountryAggregate(Base):
    """Aggregated threat counts by country and hour (for data older than 30 days)."""

    __tablename__ = "country_aggregates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Aggregation key
    country_code: Mapped[str] = mapped_column(String(2), nullable=False)
    country_name: Mapped[str] = mapped_column(String(100), nullable=False)
    hour_bucket: Mapped[datetime] = mapped_column(DateTime, nullable=False)  # Truncated to hour

    # Aggregated data
    event_count: Mapped[int] = mapped_column(Integer, default=0)
    unique_ips: Mapped[int] = mapped_column(Integer, default=0)

    # Representative coordinates for mapping
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    __table_args__ = (
        Index('ix_country_aggregates_hour_bucket', 'hour_bucket'),
        Index('ix_country_aggregates_country_code', 'country_code'),
    )


class AgentVersion(Base):
    """Published agent versions available for deployment."""

    __tablename__ = "agent_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Version information
    version: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)

    # Dependencies (JSON array of package names)
    dependencies: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON: ["websockets", "pyyaml"]

    # Release notes
    release_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Status
    is_current: Mapped[bool] = mapped_column(Boolean, default=False)  # Active version for rollout
    is_deprecated: Mapped[bool] = mapped_column(Boolean, default=False)

    # Timestamps
    published_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    __table_args__ = (
        Index('ix_agent_versions_version', 'version'),
        Index('ix_agent_versions_is_current', 'is_current'),
    )


class AgentUpdateHistory(Base):
    """History of agent updates - tracks when each agent updated."""

    __tablename__ = "agent_update_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Agent reference
    agent_hostname: Mapped[str] = mapped_column(String(255), nullable=False)

    # Update details
    from_version: Mapped[str] = mapped_column(String(50), nullable=False)
    to_version: Mapped[str] = mapped_column(String(50), nullable=False)

    # Status
    success: Mapped[bool] = mapped_column(Boolean, nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Timestamps
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    __table_args__ = (
        Index('ix_agent_update_history_agent_hostname', 'agent_hostname'),
        Index('ix_agent_update_history_started_at', 'started_at'),
    )


class HealthCheck(Base):
    """Health check results from agents."""

    __tablename__ = "health_checks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Agent reference
    agent_hostname: Mapped[str] = mapped_column(String(255), nullable=False)

    # Check details
    check_name: Mapped[str] = mapped_column(String(100), nullable=False)
    check_type: Mapped[str] = mapped_column(String(50), nullable=False)  # connectivity, latency, custom

    # Results
    is_healthy: Mapped[bool] = mapped_column(Boolean, nullable=False)
    latency_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON string for extra data

    # Timestamps
    check_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    __table_args__ = (
        Index('ix_health_checks_check_time', 'check_time'),
        Index('ix_health_checks_agent_hostname', 'agent_hostname'),
    )
