"""Service check models for monitoring various services."""

from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import DateTime, Float, Integer, String, Text, Boolean, Index
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class ServiceCheckType(str, Enum):
    """Types of service checks."""
    HTTP = "http"
    HTTP_PROXY = "http_proxy"
    DNS = "dns"
    FILE = "file"


class ServiceCheckStatus(str, Enum):
    """Current status of a service check."""
    PASSING = "passing"
    FAILING = "failing"
    UNKNOWN = "unknown"


class ServiceCheck(Base):
    """Definition of a service check."""

    __tablename__ = "service_checks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Basic info
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    check_type: Mapped[str] = mapped_column(String(20), nullable=False)  # http, http_proxy, dns, file
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    # Target configuration
    target: Mapped[str] = mapped_column(String(1024), nullable=False)  # URL, hostname, etc.

    # HTTP/HTTPS specific
    expected_status_code: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    expected_content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Content to search for

    # HTTP via Proxy specific
    proxy_address: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)

    # DNS specific
    dns_server: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    expected_ip: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)  # Expected IP/record
    dns_record_type: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # A, AAAA, CNAME, etc.

    # Timeout in seconds
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=30)

    # Check scheduling
    interval_seconds: Mapped[int] = mapped_column(Integer, default=300)  # Default 5 minutes

    # Alerting configuration
    failure_threshold: Mapped[int] = mapped_column(Integer, default=2)  # Consecutive failures before alert
    alert_interval_hours: Mapped[int] = mapped_column(Integer, default=6)  # Re-alert interval

    # Agent assignment
    assigned_agent: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)  # Hostname or null for "any"

    # Current state (cached from results)
    current_status: Mapped[str] = mapped_column(String(20), default=ServiceCheckStatus.UNKNOWN.value)
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0)
    last_check_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_success_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_failure_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_latency_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Alert state
    is_alerting: Mapped[bool] = mapped_column(Boolean, default=False)
    last_alert_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    alert_count: Mapped[int] = mapped_column(Integer, default=0)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    __table_args__ = (
        Index('ix_service_checks_check_type', 'check_type'),
        Index('ix_service_checks_current_status', 'current_status'),
        Index('ix_service_checks_assigned_agent', 'assigned_agent'),
    )


class ServiceCheckResult(Base):
    """Individual result from a service check execution."""

    __tablename__ = "service_check_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Reference to check
    check_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    # Execution info
    agent_hostname: Mapped[str] = mapped_column(String(255), nullable=False)

    # Result
    is_success: Mapped[bool] = mapped_column(Boolean, nullable=False)
    latency_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Response details (for debugging)
    status_code: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    response_body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Truncated response
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Timestamp
    check_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    __table_args__ = (
        Index('ix_service_check_results_check_time', 'check_time'),
        Index('ix_service_check_results_check_id_time', 'check_id', 'check_time'),
    )


class ServiceCheckAlert(Base):
    """Alert history for service checks."""

    __tablename__ = "service_check_alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Reference to check
    check_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    check_name: Mapped[str] = mapped_column(String(255), nullable=False)

    # Alert type
    alert_type: Mapped[str] = mapped_column(String(20), nullable=False)  # failure, recovery

    # Alert details
    message: Mapped[str] = mapped_column(Text, nullable=False)
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0)

    # Notification status
    discord_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    email_sent: Mapped[bool] = mapped_column(Boolean, default=False)

    # Timestamp
    alert_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    __table_args__ = (
        Index('ix_service_check_alerts_check_id', 'check_id'),
        Index('ix_service_check_alerts_alert_time', 'alert_time'),
    )
