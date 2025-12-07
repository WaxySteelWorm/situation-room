"""Network monitoring API routes for BGP and traffic stats."""

import logging
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_config, get_cloudflare_radar_api_key
from ..models.database import get_db
from ..services.auth import Session
from ..services.cloudflare_radar import CloudflareRadarService
from ..services.observium import ObserviumService
from .auth import get_current_session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/network", tags=["network"])


# ==================== Request/Response Schemas ====================

class NetworkStatusSchema(BaseModel):
    enabled: bool
    cloudflare_radar_available: bool
    observium_available: bool
    asn: int
    monitored_interfaces: list[str]


class BGPEventSchema(BaseModel):
    id: int
    event_type: str
    asn: int
    prefix: Optional[str]
    as_path: Optional[str]
    origin_asn: Optional[int]
    peer_asn: Optional[int]
    peer_name: Optional[str]
    peer_state: Optional[str]
    description: Optional[str]
    severity: Optional[str]
    event_time: str
    alert_sent: bool


class BGPPrefixStatusSchema(BaseModel):
    id: int
    asn: int
    prefix: str
    is_visible: bool
    visibility_count: Optional[int]
    as_path: Optional[str]
    origin_asn: Optional[int]
    first_seen: str
    last_seen: str


class BGPSummarySchema(BaseModel):
    asn: int
    prefix_count: int
    prefixes: list[dict[str, Any]]
    recent_events_24h: int
    event_counts: dict[str, int]
    api_overview: Optional[dict[str, Any]]


class TrafficSampleSchema(BaseModel):
    id: int
    interface_name: str
    device_hostname: Optional[str]
    traffic_in: int
    traffic_out: int
    interface_speed: Optional[int]
    utilization_in: Optional[float]
    utilization_out: Optional[float]
    sample_time: str


class DailyTrafficSummarySchema(BaseModel):
    id: int
    interface_name: str
    device_hostname: Optional[str]
    date: str
    total_in_bytes: int
    total_out_bytes: int
    peak_in: Optional[int]
    peak_out: Optional[int]
    avg_in: Optional[int]
    avg_out: Optional[int]
    sample_count: int


class ObserviumAlertSchema(BaseModel):
    id: int
    observium_alert_id: Optional[int]
    device_hostname: Optional[str]
    entity_type: Optional[str]
    entity_name: Optional[str]
    alert_status: str
    severity: Optional[str]
    message: Optional[str]
    alert_time: str
    resolved_time: Optional[str]


class InterfaceStatsSchema(BaseModel):
    interface_name: str
    port_id: Optional[int]
    ifSpeed: Optional[int]
    ifOperStatus: Optional[str]
    ifAdminStatus: Optional[str]
    ifInOctets_rate: Optional[float]
    ifOutOctets_rate: Optional[float]
    ifInOctets_perc: Optional[float]
    ifOutOctets_perc: Optional[float]
    last_sample_time: Optional[str]
    device_hostname: Optional[str]
    error: Optional[str]


class TrafficSummarySchema(BaseModel):
    interfaces: list[dict[str, Any]]
    daily_totals: list[dict[str, Any]]
    active_alerts: int
    monitoring_interfaces: list[str]


# ==================== Status/Config Endpoints ====================

@router.get("/status", response_model=NetworkStatusSchema)
async def get_network_status(
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get network monitoring module status."""
    config = get_config()

    cloudflare_service = CloudflareRadarService(db)
    observium_service = ObserviumService(db)

    cloudflare_available = await cloudflare_service.is_available()
    observium_available = await observium_service.is_available()

    return NetworkStatusSchema(
        enabled=config.network.enabled,
        cloudflare_radar_available=cloudflare_available,
        observium_available=observium_available,
        asn=config.network.cloudflare_radar.asn,
        monitored_interfaces=config.network.observium.interfaces,
    )


# ==================== BGP Endpoints ====================

@router.get("/bgp/summary", response_model=BGPSummarySchema)
async def get_bgp_summary(
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get BGP status summary."""
    cloudflare_service = CloudflareRadarService(db)
    summary = await cloudflare_service.get_bgp_summary()
    return BGPSummarySchema(**summary)


@router.get("/bgp/events", response_model=list[BGPEventSchema])
async def get_bgp_events(
    hours: int = Query(24, ge=1, le=720),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get recent BGP events."""
    cloudflare_service = CloudflareRadarService(db)
    events = await cloudflare_service.get_recent_events(hours=hours, limit=limit)

    return [
        BGPEventSchema(
            id=e.id,
            event_type=e.event_type,
            asn=e.asn,
            prefix=e.prefix,
            as_path=e.as_path,
            origin_asn=e.origin_asn,
            peer_asn=e.peer_asn,
            peer_name=e.peer_name,
            peer_state=e.peer_state,
            description=e.description,
            severity=e.severity,
            event_time=e.event_time.isoformat(),
            alert_sent=e.alert_sent,
        )
        for e in events
    ]


@router.get("/bgp/prefixes", response_model=list[BGPPrefixStatusSchema])
async def get_bgp_prefixes(
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get current BGP prefix statuses."""
    cloudflare_service = CloudflareRadarService(db)
    prefixes = await cloudflare_service.get_prefix_statuses()

    return [
        BGPPrefixStatusSchema(
            id=p.id,
            asn=p.asn,
            prefix=p.prefix,
            is_visible=p.is_visible,
            visibility_count=p.visibility_count,
            as_path=p.as_path,
            origin_asn=p.origin_asn,
            first_seen=p.first_seen.isoformat(),
            last_seen=p.last_seen.isoformat(),
        )
        for p in prefixes
    ]


@router.get("/bgp/routes")
async def get_bgp_routes(
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Fetch current BGP routes from Cloudflare Radar API."""
    cloudflare_service = CloudflareRadarService(db)
    routes = await cloudflare_service.fetch_bgp_routes()
    return routes


@router.get("/bgp/timeseries")
async def get_bgp_timeseries(
    hours: int = Query(24, ge=1, le=168),
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get BGP route change timeseries data."""
    cloudflare_service = CloudflareRadarService(db)
    timeseries = await cloudflare_service.fetch_bgp_timeseries(hours=hours)
    return timeseries


@router.get("/bgp/as-overview")
async def get_as_overview(
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get AS overview from Cloudflare Radar."""
    cloudflare_service = CloudflareRadarService(db)
    overview = await cloudflare_service.fetch_as_overview()
    return overview


@router.post("/bgp/poll")
async def poll_bgp_updates(
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Manually trigger a BGP data poll (admin only)."""
    cloudflare_service = CloudflareRadarService(db)
    results = await cloudflare_service.poll_and_update()
    return results


# ==================== Traffic Endpoints ====================

@router.get("/traffic/summary", response_model=TrafficSummarySchema)
async def get_traffic_summary(
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get traffic status summary."""
    observium_service = ObserviumService(db)
    summary = await observium_service.get_traffic_summary()
    return TrafficSummarySchema(**summary)


@router.get("/traffic/interfaces", response_model=list[InterfaceStatsSchema])
async def get_interface_stats(
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get current stats for all monitored interfaces."""
    observium_service = ObserviumService(db)
    stats = await observium_service.get_current_interface_stats()
    return [InterfaceStatsSchema(**s) for s in stats]


@router.get("/traffic/samples/{interface_name}", response_model=list[TrafficSampleSchema])
async def get_traffic_samples(
    interface_name: str,
    minutes: int = Query(60, ge=1, le=1440),
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get traffic samples for an interface."""
    observium_service = ObserviumService(db)
    samples = await observium_service.get_recent_traffic(
        interface_name=interface_name,
        minutes=minutes,
    )

    return [
        TrafficSampleSchema(
            id=s.id,
            interface_name=s.interface_name,
            device_hostname=s.device_hostname,
            traffic_in=s.traffic_in,
            traffic_out=s.traffic_out,
            interface_speed=s.interface_speed,
            utilization_in=s.utilization_in,
            utilization_out=s.utilization_out,
            sample_time=s.sample_time.isoformat(),
        )
        for s in samples
    ]


@router.get("/traffic/graph/{interface_name}")
async def get_traffic_graph_data(
    interface_name: str,
    hours: int = Query(24, ge=1, le=168),
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get traffic data formatted for graphing."""
    observium_service = ObserviumService(db)
    data = await observium_service.get_traffic_graph_data(
        interface_name=interface_name,
        hours=hours,
    )
    return {"interface_name": interface_name, "data": data}


@router.get("/traffic/daily/{interface_name}", response_model=list[DailyTrafficSummarySchema])
async def get_daily_traffic(
    interface_name: str,
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get daily traffic summaries for an interface."""
    observium_service = ObserviumService(db)
    summaries = await observium_service.get_daily_summaries(
        interface_name=interface_name,
        days=days,
    )

    return [
        DailyTrafficSummarySchema(
            id=s.id,
            interface_name=s.interface_name,
            device_hostname=s.device_hostname,
            date=s.date.isoformat(),
            total_in_bytes=s.total_in_bytes,
            total_out_bytes=s.total_out_bytes,
            peak_in=s.peak_in,
            peak_out=s.peak_out,
            avg_in=s.avg_in,
            avg_out=s.avg_out,
            sample_count=s.sample_count,
        )
        for s in summaries
    ]


@router.post("/traffic/poll")
async def poll_traffic_updates(
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Manually trigger a traffic data poll (admin only)."""
    observium_service = ObserviumService(db)
    results = await observium_service.poll_and_update()
    return results


# ==================== Observium Alert Endpoints ====================

@router.get("/alerts", response_model=list[ObserviumAlertSchema])
async def get_observium_alerts(
    hours: int = Query(24, ge=1, le=720),
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get Observium alerts."""
    observium_service = ObserviumService(db)
    alerts = await observium_service.get_recent_alerts(hours=hours, status=status)

    return [
        ObserviumAlertSchema(
            id=a.id,
            observium_alert_id=a.observium_alert_id,
            device_hostname=a.device_hostname,
            entity_type=a.entity_type,
            entity_name=a.entity_name,
            alert_status=a.alert_status,
            severity=a.severity,
            message=a.message,
            alert_time=a.alert_time.isoformat(),
            resolved_time=a.resolved_time.isoformat() if a.resolved_time else None,
        )
        for a in alerts
    ]


# ==================== Observium Direct API Endpoints ====================

@router.get("/observium/devices")
async def get_observium_devices(
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get devices from Observium API."""
    observium_service = ObserviumService(db)
    devices = await observium_service.fetch_devices()
    return devices


@router.get("/observium/ports")
async def get_observium_ports(
    device_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get ports from Observium API."""
    observium_service = ObserviumService(db)
    ports = await observium_service.fetch_ports(device_id=device_id)
    return ports


@router.get("/observium/alerts")
async def get_observium_api_alerts(
    status: str = "all",
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get alerts directly from Observium API."""
    observium_service = ObserviumService(db)
    alerts = await observium_service.fetch_alerts(status=status)
    return alerts
