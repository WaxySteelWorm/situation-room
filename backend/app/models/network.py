"""Network monitoring models for BGP events and traffic data."""

from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import DateTime, Float, Integer, String, Text, Boolean, Index, BigInteger
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class BGPEventType(str, Enum):
    """Types of BGP events."""
    ROUTE_CHANGE = "route_change"
    ROUTE_ANNOUNCEMENT = "route_announcement"
    ROUTE_WITHDRAWAL = "route_withdrawal"
    HIJACK = "hijack"
    LEAK = "leak"
    ANOMALY = "anomaly"
    PEER_STATE_CHANGE = "peer_state_change"


class BGPEvent(Base):
    """BGP routing events from Cloudflare Radar."""

    __tablename__ = "bgp_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Event identification
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    asn: Mapped[int] = mapped_column(Integer, nullable=False)

    # Prefix information
    prefix: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # e.g., "192.0.2.0/24"
    prefix_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # AS path information
    as_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON list of ASNs
    origin_asn: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Peer information
    peer_asn: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    peer_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    peer_state: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # up, down

    # Event details
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    severity: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # info, warning, critical
    raw_data: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON

    # Alert tracking
    alert_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    alert_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Timestamps
    event_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    __table_args__ = (
        Index('ix_bgp_events_event_time', 'event_time'),
        Index('ix_bgp_events_event_type', 'event_type'),
        Index('ix_bgp_events_asn', 'asn'),
        Index('ix_bgp_events_prefix', 'prefix'),
    )


class BGPPrefixStatus(Base):
    """Current BGP prefix status snapshot."""

    __tablename__ = "bgp_prefix_status"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Prefix information
    asn: Mapped[int] = mapped_column(Integer, nullable=False)
    prefix: Mapped[str] = mapped_column(String(50), nullable=False)

    # Visibility status
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True)
    visibility_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # Number of peers seeing it

    # AS path
    as_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON list
    origin_asn: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Timestamps
    first_seen: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    last_seen: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    __table_args__ = (
        Index('ix_bgp_prefix_status_asn', 'asn'),
        Index('ix_bgp_prefix_status_prefix', 'prefix'),
    )


class TrafficSample(Base):
    """Traffic samples from Observium interfaces."""

    __tablename__ = "traffic_samples"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Interface identification
    interface_name: Mapped[str] = mapped_column(String(100), nullable=False)
    device_hostname: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Traffic metrics (bytes per second)
    traffic_in: Mapped[int] = mapped_column(BigInteger, nullable=False)  # bits/sec or bytes/sec
    traffic_out: Mapped[int] = mapped_column(BigInteger, nullable=False)

    # Interface speed (for utilization calculation)
    interface_speed: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)  # bits/sec

    # Calculated utilization (percentage)
    utilization_in: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    utilization_out: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Sample timestamp
    sample_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    __table_args__ = (
        Index('ix_traffic_samples_sample_time', 'sample_time'),
        Index('ix_traffic_samples_interface_name', 'interface_name'),
    )


class DailyTrafficSummary(Base):
    """Daily traffic totals for each interface."""

    __tablename__ = "daily_traffic_summaries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Interface identification
    interface_name: Mapped[str] = mapped_column(String(100), nullable=False)
    device_hostname: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Date (truncated to day)
    date: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    # Total traffic for the day (bytes)
    total_in_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    total_out_bytes: Mapped[int] = mapped_column(BigInteger, default=0)

    # Peak traffic (bits/sec)
    peak_in: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    peak_out: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)

    # Average traffic (bits/sec)
    avg_in: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    avg_out: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)

    # Sample count for the day
    sample_count: Mapped[int] = mapped_column(Integer, default=0)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    __table_args__ = (
        Index('ix_daily_traffic_summaries_date', 'date'),
        Index('ix_daily_traffic_summaries_interface_name', 'interface_name'),
    )


class ObserviumAlert(Base):
    """Alerts from Observium."""

    __tablename__ = "observium_alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Alert identification
    observium_alert_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # Observium's internal ID

    # Alert details
    device_hostname: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    entity_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # port, sensor, etc.
    entity_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Alert status
    alert_status: Mapped[str] = mapped_column(String(50), nullable=False)  # active, resolved, etc.
    severity: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # warning, critical, etc.

    # Alert message
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    raw_data: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON

    # Timestamps
    alert_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    resolved_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    __table_args__ = (
        Index('ix_observium_alerts_alert_time', 'alert_time'),
        Index('ix_observium_alerts_device_hostname', 'device_hostname'),
        Index('ix_observium_alerts_alert_status', 'alert_status'),
    )
