"""Monitoring API routes for threat tracking and metrics."""

import json
import logging
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_config
from ..models.database import get_db
from ..services.auth import Session
from ..services.monitoring import MonitoringService
from ..services.prometheus import get_prometheus_service
from ..services.websocket_manager import get_websocket_manager, WebSocketManager
from .auth import get_current_session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/monitoring", tags=["monitoring"])


# ==================== Request/Response Schemas ====================

class AgentSchema(BaseModel):
    id: int
    hostname: str
    ip_address: str
    version: Optional[str]
    os_info: Optional[str]
    status: str
    last_seen: Optional[str]
    is_active: bool
    report_interval_seconds: int
    created_at: str


class ThreatEventSchema(BaseModel):
    id: int
    agent_hostname: str
    source_ip: str
    source_port: Optional[int]
    dest_ip: Optional[str]
    dest_port: Optional[int]
    protocol: Optional[str]
    country_code: Optional[str]
    country_name: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    city: Optional[str]
    event_time: str


class MapPointSchema(BaseModel):
    lat: float
    lng: float
    count: int
    country_code: Optional[str]
    country_name: Optional[str]


class ThreatSummarySchema(BaseModel):
    total_events: int
    unique_ips: int
    top_countries: list[dict[str, Any]]
    top_ports: list[dict[str, Any]]
    hourly_counts: list[dict[str, Any]]
    period: dict[str, str]


class HealthCheckSchema(BaseModel):
    hostname: str
    check_name: str
    check_type: str
    is_healthy: bool
    latency_ms: Optional[float]
    message: Optional[str]
    check_time: str


class HostMetricsSchema(BaseModel):
    hostname: str
    instance: str
    cpu_usage_percent: Optional[float]
    memory_usage_percent: Optional[float]
    memory_total_bytes: Optional[float]
    memory_used_bytes: Optional[float]
    disk_usage_percent: Optional[float]
    disk_total_bytes: Optional[float]
    disk_used_bytes: Optional[float]
    network_rx_bytes_per_sec: Optional[float]
    network_tx_bytes_per_sec: Optional[float]
    uptime_seconds: Optional[float]
    load_average_1m: Optional[float]
    load_average_5m: Optional[float]
    load_average_15m: Optional[float]


class MetricValueSchema(BaseModel):
    timestamp: str
    value: float


class MonitoringStatusSchema(BaseModel):
    enabled: bool
    prometheus_available: bool
    geoip_available: bool
    connected_agents: int
    total_agents: int


# ==================== Status/Config Endpoints ====================

@router.get("/status", response_model=MonitoringStatusSchema)
async def get_monitoring_status(
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get monitoring module status."""
    config = get_config()
    monitoring_service = MonitoringService(db)
    prometheus_service = get_prometheus_service()
    ws_manager = get_websocket_manager()

    prometheus_available = await prometheus_service.is_available()
    agents = await monitoring_service.get_all_agents()

    from ..services.geoip import get_geoip_service
    geoip = get_geoip_service()
    # Check if GeoIP is available by doing a test lookup
    test_result = geoip.lookup("8.8.8.8")
    geoip_available = test_result.country_code is not None

    return MonitoringStatusSchema(
        enabled=config.monitoring.enabled,
        prometheus_available=prometheus_available,
        geoip_available=geoip_available,
        connected_agents=len(ws_manager.get_connected_agents()),
        total_agents=len(agents)
    )


# ==================== Agent Endpoints ====================

@router.get("/agents", response_model=list[AgentSchema])
async def get_agents(
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get all registered monitoring agents."""
    monitoring_service = MonitoringService(db)
    agents = await monitoring_service.get_all_agents(include_inactive=include_inactive)

    return [
        AgentSchema(
            id=a.id,
            hostname=a.hostname,
            ip_address=a.ip_address,
            version=a.version,
            os_info=a.os_info,
            status=a.status,
            last_seen=a.last_seen.isoformat() if a.last_seen else None,
            is_active=a.is_active,
            report_interval_seconds=a.report_interval_seconds,
            created_at=a.created_at.isoformat()
        )
        for a in agents
    ]


@router.get("/agents/connected")
async def get_connected_agents(
    session: Session = Depends(get_current_session),
):
    """Get currently connected agents via WebSocket."""
    ws_manager = get_websocket_manager()
    return ws_manager.get_connected_agents()


# ==================== Threat Events Endpoints ====================

@router.get("/threats/recent", response_model=list[ThreatEventSchema])
async def get_recent_threats(
    minutes: int = Query(60, ge=1, le=1440),
    limit: int = Query(1000, ge=1, le=10000),
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get recent threat events."""
    monitoring_service = MonitoringService(db)
    events = await monitoring_service.get_recent_threats(minutes=minutes, limit=limit)

    return [
        ThreatEventSchema(
            id=e.id,
            agent_hostname=e.agent_hostname,
            source_ip=e.source_ip,
            source_port=e.source_port,
            dest_ip=e.dest_ip,
            dest_port=e.dest_port,
            protocol=e.protocol,
            country_code=e.country_code,
            country_name=e.country_name,
            latitude=e.latitude,
            longitude=e.longitude,
            city=e.city,
            event_time=e.event_time.isoformat()
        )
        for e in events
    ]


@router.get("/threats/summary", response_model=ThreatSummarySchema)
async def get_threat_summary(
    hours: int = Query(24, ge=1, le=720),
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get aggregated threat statistics."""
    from datetime import timedelta
    end_time = datetime.utcnow()
    start_time = end_time - timedelta(hours=hours)

    monitoring_service = MonitoringService(db)
    summary = await monitoring_service.get_threat_summary(start_time, end_time)

    return ThreatSummarySchema(**summary)


@router.get("/threats/map", response_model=list[MapPointSchema])
async def get_threat_map_data(
    minutes: int = Query(60, ge=1, le=43200),
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get threat data formatted for map visualization."""
    monitoring_service = MonitoringService(db)
    # Use aggregates for data older than 24 hours
    use_aggregates = minutes > 1440
    points = await monitoring_service.get_map_data(minutes=minutes, use_aggregates=use_aggregates)

    return [MapPointSchema(**p) for p in points]


# ==================== Health Check Endpoints ====================

@router.get("/health-checks", response_model=list[HealthCheckSchema])
async def get_health_checks(
    hostname: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get latest health check results."""
    monitoring_service = MonitoringService(db)
    checks = await monitoring_service.get_latest_health_checks(hostname=hostname)

    return [HealthCheckSchema(**c) for c in checks]


# ==================== Prometheus/Metrics Endpoints ====================

@router.get("/prometheus/status")
async def get_prometheus_status(
    session: Session = Depends(get_current_session),
):
    """Check Prometheus connection status."""
    prometheus_service = get_prometheus_service()
    available = await prometheus_service.is_available()

    config = get_config()
    return {
        "enabled": config.monitoring.prometheus.enabled,
        "available": available,
        "url": config.monitoring.prometheus.url if config.monitoring.prometheus.enabled else None
    }


@router.get("/prometheus/hosts")
async def get_prometheus_hosts(
    session: Session = Depends(get_current_session),
):
    """Get list of hosts monitored by Prometheus."""
    prometheus_service = get_prometheus_service()
    hosts = await prometheus_service.get_hosts()
    return {"hosts": hosts}


@router.get("/prometheus/metrics/{instance}", response_model=HostMetricsSchema)
async def get_host_metrics(
    instance: str,
    session: Session = Depends(get_current_session),
):
    """Get current metrics for a specific host."""
    prometheus_service = get_prometheus_service()
    metrics = await prometheus_service.get_host_metrics(instance)

    if not metrics:
        raise HTTPException(status_code=404, detail="Host not found or metrics unavailable")

    return HostMetricsSchema(
        hostname=metrics.hostname,
        instance=metrics.instance,
        cpu_usage_percent=metrics.cpu_usage_percent,
        memory_usage_percent=metrics.memory_usage_percent,
        memory_total_bytes=metrics.memory_total_bytes,
        memory_used_bytes=metrics.memory_used_bytes,
        disk_usage_percent=metrics.disk_usage_percent,
        disk_total_bytes=metrics.disk_total_bytes,
        disk_used_bytes=metrics.disk_used_bytes,
        network_rx_bytes_per_sec=metrics.network_rx_bytes_per_sec,
        network_tx_bytes_per_sec=metrics.network_tx_bytes_per_sec,
        uptime_seconds=metrics.uptime_seconds,
        load_average_1m=metrics.load_average_1m,
        load_average_5m=metrics.load_average_5m,
        load_average_15m=metrics.load_average_15m
    )


@router.get("/prometheus/metrics")
async def get_all_host_metrics(
    session: Session = Depends(get_current_session),
):
    """Get metrics for all monitored hosts."""
    prometheus_service = get_prometheus_service()
    all_metrics = await prometheus_service.get_all_host_metrics()

    return [
        {
            "hostname": m.hostname,
            "instance": m.instance,
            "cpu_usage_percent": m.cpu_usage_percent,
            "memory_usage_percent": m.memory_usage_percent,
            "disk_usage_percent": m.disk_usage_percent,
            "network_rx_bytes_per_sec": m.network_rx_bytes_per_sec,
            "network_tx_bytes_per_sec": m.network_tx_bytes_per_sec,
            "uptime_seconds": m.uptime_seconds,
            "load_average_1m": m.load_average_1m
        }
        for m in all_metrics
    ]


@router.get("/prometheus/history/{instance}/{metric}")
async def get_metric_history(
    instance: str,
    metric: str,
    hours: int = Query(24, ge=1, le=168),
    session: Session = Depends(get_current_session),
):
    """Get historical metric data for a host."""
    if metric not in ["cpu", "memory", "disk", "network_rx", "network_tx"]:
        raise HTTPException(status_code=400, detail="Invalid metric type")

    prometheus_service = get_prometheus_service()
    values = await prometheus_service.get_metric_history(instance, metric, hours)

    return {
        "instance": instance,
        "metric": metric,
        "values": [
            {"timestamp": v.timestamp.isoformat(), "value": v.value}
            for v in values
        ]
    }


# ==================== WebSocket Endpoint for Agents ====================

@router.websocket("/ws/agent")
async def agent_websocket(
    websocket: WebSocket,
    db: AsyncSession = Depends(get_db),
):
    """
    WebSocket endpoint for monitoring agents.

    Protocol:
    1. Agent connects and sends authentication message:
       {"type": "auth", "hostname": "...", "api_key": "...", "version": "...", "os_info": "..."}
    2. Server accepts or rejects
    3. Agent sends data messages:
       {"type": "ufw_logs", "logs": ["log line 1", "log line 2", ...]}
       {"type": "health_check", "checks": [{"name": "...", "type": "...", "healthy": true, ...}]}
    4. Server can send commands:
       {"type": "ping"}
       {"type": "config", "report_interval": 60}
    """
    ws_manager = get_websocket_manager()
    hostname = None

    try:
        # Wait for authentication message
        await websocket.accept()
        auth_data = await websocket.receive_json()

        if auth_data.get("type") != "auth":
            await websocket.close(code=4000, reason="Expected auth message")
            return

        hostname = auth_data.get("hostname")
        api_key = auth_data.get("api_key")
        version = auth_data.get("version")
        os_info = auth_data.get("os_info")
        client_ip = websocket.client.host if websocket.client else "unknown"

        if not hostname or not api_key:
            await websocket.close(code=4001, reason="Missing hostname or api_key")
            return

        # Verify API key
        if not ws_manager.verify_api_key(api_key):
            await websocket.close(code=4001, reason="Invalid API key")
            logger.warning(f"Agent auth failed: {hostname} from {client_ip}")
            return

        # Register agent in database
        monitoring_service = MonitoringService(db)
        agent = await monitoring_service.register_agent(
            hostname=hostname,
            ip_address=client_ip,
            api_key=api_key,
            version=version,
            os_info=os_info
        )

        if not agent:
            await websocket.close(code=4001, reason="Registration failed")
            return

        # Track connection
        ws_manager._connections[hostname] = type('AgentConnection', (), {
            'websocket': websocket,
            'hostname': hostname,
            'ip_address': client_ip,
            'connected_at': datetime.utcnow(),
            'last_message': datetime.utcnow()
        })()

        logger.info(f"Agent connected: {hostname} ({client_ip})")

        # Send acknowledgment
        await websocket.send_json({
            "type": "auth_success",
            "message": f"Welcome {hostname}",
            "report_interval": agent.report_interval_seconds
        })

        # Message loop
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "ufw_logs":
                # Process UFW log entries
                logs = data.get("logs", [])
                logger.info(f"Received {len(logs)} UFW logs from {hostname}")
                parsed_count = 0
                for log_line in logs:
                    parsed = WebSocketManager.parse_ufw_log(log_line)
                    if parsed:
                        parsed_count += 1
                        try:
                            await monitoring_service.record_threat_event(hostname, parsed)
                        except Exception as e:
                            logger.error(f"Failed to record threat event: {e}")
                    else:
                        logger.debug(f"Failed to parse UFW log: {log_line[:100]}")

                if parsed_count > 0:
                    logger.info(f"Recorded {parsed_count} threat events from {hostname}")
                elif logs:
                    logger.warning(f"No UFW logs could be parsed from {hostname}. Sample: {logs[0][:100] if logs else 'N/A'}")

                # Update last seen
                await monitoring_service.update_agent_status(hostname)

            elif msg_type == "health_check":
                # Process health check results
                checks = data.get("checks", [])
                now = datetime.utcnow()
                for check in checks:
                    await monitoring_service.record_health_check(
                        hostname=hostname,
                        check_name=check.get("name", "unknown"),
                        check_type=check.get("type", "custom"),
                        is_healthy=check.get("healthy", False),
                        check_time=now,
                        latency_ms=check.get("latency_ms"),
                        message=check.get("message"),
                        details=json.dumps(check.get("details")) if check.get("details") else None
                    )

                await monitoring_service.update_agent_status(hostname)

            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})
                await monitoring_service.update_agent_status(hostname)

            # Update last message time
            if hostname in ws_manager._connections:
                ws_manager._connections[hostname].last_message = datetime.utcnow()

    except WebSocketDisconnect:
        logger.info(f"Agent disconnected: {hostname}")
    except Exception as e:
        logger.error(f"WebSocket error for {hostname}: {e}")
    finally:
        if hostname:
            await ws_manager.disconnect(hostname)
