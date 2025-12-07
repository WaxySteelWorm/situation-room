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


class AgentVersionSchema(BaseModel):
    id: int
    version: str
    sha256: str
    dependencies: list[str]
    release_notes: Optional[str]
    is_current: bool
    is_deprecated: bool
    published_at: str
    created_at: str


class AgentVersionCreateSchema(BaseModel):
    version: str
    sha256: str
    dependencies: list[str] = ["websockets", "pyyaml"]
    release_notes: Optional[str] = None
    is_current: bool = False


class AgentUpdateHistorySchema(BaseModel):
    id: int
    agent_hostname: str
    from_version: str
    to_version: str
    success: bool
    error_message: Optional[str]
    started_at: str
    completed_at: Optional[str]


class AgentRolloutStatusSchema(BaseModel):
    current_version: Optional[str]
    version_distribution: list[dict[str, Any]]
    agents_needing_update: int
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


# ==================== Agent Version Management Endpoints ====================

@router.get("/versions", response_model=list[AgentVersionSchema])
async def get_agent_versions(
    include_deprecated: bool = False,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get all published agent versions."""
    from sqlalchemy import select
    from ..models.monitoring import AgentVersion

    query = select(AgentVersion).order_by(AgentVersion.published_at.desc())
    if not include_deprecated:
        query = query.where(AgentVersion.is_deprecated == False)

    result = await db.execute(query)
    versions = result.scalars().all()

    return [
        AgentVersionSchema(
            id=v.id,
            version=v.version,
            sha256=v.sha256,
            dependencies=json.loads(v.dependencies) if v.dependencies else [],
            release_notes=v.release_notes,
            is_current=v.is_current,
            is_deprecated=v.is_deprecated,
            published_at=v.published_at.isoformat(),
            created_at=v.created_at.isoformat()
        )
        for v in versions
    ]


@router.post("/versions", response_model=AgentVersionSchema)
async def create_agent_version(
    version_data: AgentVersionCreateSchema,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Publish a new agent version."""
    from sqlalchemy import select, update
    from ..models.monitoring import AgentVersion

    # Check if version already exists
    result = await db.execute(
        select(AgentVersion).where(AgentVersion.version == version_data.version)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Version {version_data.version} already exists")

    # If this is the current version, unset current on all others
    if version_data.is_current:
        await db.execute(
            update(AgentVersion).where(AgentVersion.is_current == True).values(is_current=False)
        )

    new_version = AgentVersion(
        version=version_data.version,
        sha256=version_data.sha256,
        dependencies=json.dumps(version_data.dependencies),
        release_notes=version_data.release_notes,
        is_current=version_data.is_current
    )
    db.add(new_version)
    await db.commit()
    await db.refresh(new_version)

    logger.info(f"Published new agent version: {version_data.version}")

    return AgentVersionSchema(
        id=new_version.id,
        version=new_version.version,
        sha256=new_version.sha256,
        dependencies=json.loads(new_version.dependencies) if new_version.dependencies else [],
        release_notes=new_version.release_notes,
        is_current=new_version.is_current,
        is_deprecated=new_version.is_deprecated,
        published_at=new_version.published_at.isoformat(),
        created_at=new_version.created_at.isoformat()
    )


@router.put("/versions/{version_id}/set-current")
async def set_current_version(
    version_id: int,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Set a version as the current version for rollout."""
    from sqlalchemy import select, update
    from ..models.monitoring import AgentVersion

    result = await db.execute(
        select(AgentVersion).where(AgentVersion.id == version_id)
    )
    version = result.scalar_one_or_none()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    if version.is_deprecated:
        raise HTTPException(status_code=400, detail="Cannot set deprecated version as current")

    # Unset current on all versions
    await db.execute(
        update(AgentVersion).where(AgentVersion.is_current == True).values(is_current=False)
    )

    # Set this version as current
    version.is_current = True
    await db.commit()

    logger.info(f"Set agent version {version.version} as current")

    return {"message": f"Version {version.version} is now the current version"}


@router.put("/versions/{version_id}/deprecate")
async def deprecate_version(
    version_id: int,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Deprecate a version (prevent updates to it)."""
    from sqlalchemy import select
    from ..models.monitoring import AgentVersion

    result = await db.execute(
        select(AgentVersion).where(AgentVersion.id == version_id)
    )
    version = result.scalar_one_or_none()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    version.is_deprecated = True
    version.is_current = False
    await db.commit()

    logger.info(f"Deprecated agent version {version.version}")

    return {"message": f"Version {version.version} has been deprecated"}


@router.get("/rollout-status", response_model=AgentRolloutStatusSchema)
async def get_rollout_status(
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get agent version rollout status."""
    from sqlalchemy import select, func
    from ..models.monitoring import AgentVersion, Agent

    # Get current version
    result = await db.execute(
        select(AgentVersion).where(AgentVersion.is_current == True)
    )
    current = result.scalar_one_or_none()
    current_version = current.version if current else None

    # Get all active agents
    result = await db.execute(
        select(Agent).where(Agent.is_active == True)
    )
    agents = result.scalars().all()
    total_agents = len(agents)

    # Count agents by version
    version_counts = {}
    for agent in agents:
        v = agent.version or "unknown"
        version_counts[v] = version_counts.get(v, 0) + 1

    version_distribution = [
        {"version": v, "count": c, "percentage": (c / total_agents * 100) if total_agents > 0 else 0}
        for v, c in sorted(version_counts.items())
    ]

    # Count agents needing update
    agents_needing_update = sum(
        1 for agent in agents
        if agent.version != current_version and current_version
    )

    return AgentRolloutStatusSchema(
        current_version=current_version,
        version_distribution=version_distribution,
        agents_needing_update=agents_needing_update,
        total_agents=total_agents
    )


@router.get("/agents/{hostname}/update-history", response_model=list[AgentUpdateHistorySchema])
async def get_agent_update_history(
    hostname: str,
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get update history for a specific agent."""
    from sqlalchemy import select
    from ..models.monitoring import AgentUpdateHistory

    result = await db.execute(
        select(AgentUpdateHistory)
        .where(AgentUpdateHistory.agent_hostname == hostname)
        .order_by(AgentUpdateHistory.started_at.desc())
        .limit(limit)
    )
    history = result.scalars().all()

    return [
        AgentUpdateHistorySchema(
            id=h.id,
            agent_hostname=h.agent_hostname,
            from_version=h.from_version,
            to_version=h.to_version,
            success=h.success,
            error_message=h.error_message,
            started_at=h.started_at.isoformat(),
            completed_at=h.completed_at.isoformat() if h.completed_at else None
        )
        for h in history
    ]


@router.get("/update-history", response_model=list[AgentUpdateHistorySchema])
async def get_all_update_history(
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get recent update history across all agents."""
    from sqlalchemy import select
    from ..models.monitoring import AgentUpdateHistory

    result = await db.execute(
        select(AgentUpdateHistory)
        .order_by(AgentUpdateHistory.started_at.desc())
        .limit(limit)
    )
    history = result.scalars().all()

    return [
        AgentUpdateHistorySchema(
            id=h.id,
            agent_hostname=h.agent_hostname,
            from_version=h.from_version,
            to_version=h.to_version,
            success=h.success,
            error_message=h.error_message,
            started_at=h.started_at.isoformat(),
            completed_at=h.completed_at.isoformat() if h.completed_at else None
        )
        for h in history
    ]


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

            elif msg_type == "update_result":
                # Agent reports the result of an update attempt
                from ..models.monitoring import AgentUpdateHistory

                success = data.get("success", False)
                from_version = data.get("from_version", "unknown")
                to_version = data.get("to_version", "unknown")
                error_message = data.get("error") if not success else None
                started_at_str = data.get("started_at")
                completed_at_str = data.get("completed_at")

                try:
                    started_at = datetime.fromisoformat(started_at_str) if started_at_str else datetime.utcnow()
                    completed_at = datetime.fromisoformat(completed_at_str) if completed_at_str else datetime.utcnow()
                except (ValueError, TypeError):
                    started_at = datetime.utcnow()
                    completed_at = datetime.utcnow()

                update_history = AgentUpdateHistory(
                    agent_hostname=hostname,
                    from_version=from_version,
                    to_version=to_version,
                    success=success,
                    error_message=error_message,
                    started_at=started_at,
                    completed_at=completed_at
                )
                db.add(update_history)
                await db.commit()

                if success:
                    logger.info(f"Agent {hostname} updated successfully: {from_version} -> {to_version}")
                else:
                    logger.warning(f"Agent {hostname} update failed: {from_version} -> {to_version}: {error_message}")

                    # Send notification for failed updates
                    try:
                        from ..services.notification import NotificationService
                        notifier = NotificationService()
                        alert_message = f"**Agent Update Failed**\n"
                        alert_message += f"Hostname: {hostname}\n"
                        alert_message += f"From: {from_version} -> {to_version}\n"
                        alert_message += f"Error: {error_message}"

                        from ..services.notification import NotificationType
                        await notifier._send_discord(alert_message, NotificationType.STATUS_CHANGED)
                    except Exception as e:
                        logger.error(f"Failed to send update failure notification: {e}")

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
