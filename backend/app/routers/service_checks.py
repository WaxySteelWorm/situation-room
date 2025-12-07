"""Service checks API routes."""

import logging
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.database import get_db
from ..models import ServiceCheckType, ServiceCheckStatus
from ..services.auth import Session
from ..services.service_check import ServiceCheckService
from ..services.monitoring import MonitoringService
from .auth import get_current_session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/service-checks", tags=["service-checks"])


# ==================== Request/Response Schemas ====================

class ServiceCheckCreate(BaseModel):
    """Schema for creating a service check."""
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    check_type: str = Field(..., description="Type: http, http_proxy, dns, file")
    target: str = Field(..., min_length=1, max_length=1024)

    # HTTP options
    expected_status_code: Optional[int] = Field(None, ge=100, le=599)
    expected_content: Optional[str] = None

    # Proxy options
    proxy_address: Optional[str] = None

    # DNS options
    dns_server: Optional[str] = None
    expected_ip: Optional[str] = None
    dns_record_type: Optional[str] = Field(None, pattern="^(A|AAAA|CNAME|MX|TXT|NS)$")

    # Timing
    timeout_seconds: int = Field(30, ge=1, le=120)
    interval_seconds: int = Field(300, ge=60, le=3600)  # 1 min to 1 hour

    # Alerting
    failure_threshold: int = Field(2, ge=1, le=10)
    alert_interval_hours: int = Field(6, ge=1, le=24)

    # Agent assignment
    assigned_agent: Optional[str] = None


class ServiceCheckUpdate(BaseModel):
    """Schema for updating a service check."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    check_type: Optional[str] = None
    target: Optional[str] = Field(None, min_length=1, max_length=1024)
    is_enabled: Optional[bool] = None
    expected_status_code: Optional[int] = Field(None, ge=100, le=599)
    expected_content: Optional[str] = None
    proxy_address: Optional[str] = None
    dns_server: Optional[str] = None
    expected_ip: Optional[str] = None
    dns_record_type: Optional[str] = None
    timeout_seconds: Optional[int] = Field(None, ge=1, le=120)
    interval_seconds: Optional[int] = Field(None, ge=60, le=3600)
    failure_threshold: Optional[int] = Field(None, ge=1, le=10)
    alert_interval_hours: Optional[int] = Field(None, ge=1, le=24)
    assigned_agent: Optional[str] = None


class ServiceCheckSchema(BaseModel):
    """Schema for service check response."""
    id: int
    name: str
    description: Optional[str]
    check_type: str
    target: str
    is_enabled: bool
    expected_status_code: Optional[int]
    expected_content: Optional[str]
    proxy_address: Optional[str]
    dns_server: Optional[str]
    expected_ip: Optional[str]
    dns_record_type: Optional[str]
    timeout_seconds: int
    interval_seconds: int
    failure_threshold: int
    alert_interval_hours: int
    assigned_agent: Optional[str]
    current_status: str
    consecutive_failures: int
    last_check_time: Optional[str]
    last_success_time: Optional[str]
    last_failure_time: Optional[str]
    last_latency_ms: Optional[float]
    is_alerting: bool
    alert_count: int
    created_at: str
    updated_at: str


class ServiceCheckResultSchema(BaseModel):
    """Schema for check result."""
    id: int
    check_id: int
    agent_hostname: str
    is_success: bool
    latency_ms: Optional[float]
    status_code: Optional[int]
    response_body: Optional[str]
    error_message: Optional[str]
    check_time: str


class DailyUptimeSchema(BaseModel):
    """Schema for daily uptime stats."""
    date: str
    total: int
    success: int
    failure: int
    uptime_pct: Optional[float]


class UptimeStatsSchema(BaseModel):
    """Schema for uptime statistics."""
    total_checks: int
    successful_checks: int
    failed_checks: int
    uptime_pct: Optional[float]
    period_hours: int


class ServiceCheckSummarySchema(BaseModel):
    """Schema for check summary."""
    total: int
    passing: int
    failing: int
    unknown: int


# ==================== Helper Functions ====================

def check_to_schema(check) -> ServiceCheckSchema:
    """Convert a ServiceCheck model to schema."""
    return ServiceCheckSchema(
        id=check.id,
        name=check.name,
        description=check.description,
        check_type=check.check_type,
        target=check.target,
        is_enabled=check.is_enabled,
        expected_status_code=check.expected_status_code,
        expected_content=check.expected_content,
        proxy_address=check.proxy_address,
        dns_server=check.dns_server,
        expected_ip=check.expected_ip,
        dns_record_type=check.dns_record_type,
        timeout_seconds=check.timeout_seconds,
        interval_seconds=check.interval_seconds,
        failure_threshold=check.failure_threshold,
        alert_interval_hours=check.alert_interval_hours,
        assigned_agent=check.assigned_agent,
        current_status=check.current_status,
        consecutive_failures=check.consecutive_failures,
        last_check_time=check.last_check_time.isoformat() if check.last_check_time else None,
        last_success_time=check.last_success_time.isoformat() if check.last_success_time else None,
        last_failure_time=check.last_failure_time.isoformat() if check.last_failure_time else None,
        last_latency_ms=check.last_latency_ms,
        is_alerting=check.is_alerting,
        alert_count=check.alert_count,
        created_at=check.created_at.isoformat(),
        updated_at=check.updated_at.isoformat(),
    )


def result_to_schema(result) -> ServiceCheckResultSchema:
    """Convert a ServiceCheckResult model to schema."""
    return ServiceCheckResultSchema(
        id=result.id,
        check_id=result.check_id,
        agent_hostname=result.agent_hostname,
        is_success=result.is_success,
        latency_ms=result.latency_ms,
        status_code=result.status_code,
        response_body=result.response_body,
        error_message=result.error_message,
        check_time=result.check_time.isoformat(),
    )


# ==================== CRUD Endpoints ====================

@router.get("", response_model=list[ServiceCheckSchema])
async def get_all_checks(
    include_disabled: bool = Query(False, description="Include disabled checks"),
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get all service checks."""
    service = ServiceCheckService(db)
    checks = await service.get_all_checks(include_disabled=include_disabled)
    return [check_to_schema(c) for c in checks]


@router.get("/summary", response_model=ServiceCheckSummarySchema)
async def get_checks_summary(
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get summary of service check statuses."""
    service = ServiceCheckService(db)
    summary = await service.get_summary()
    return ServiceCheckSummarySchema(**summary)


@router.get("/types")
async def get_check_types(
    session: Session = Depends(get_current_session),
):
    """Get available check types."""
    return {
        "types": [
            {"id": "http", "name": "HTTP/HTTPS", "description": "Check HTTP/HTTPS endpoint availability and response"},
            {"id": "http_proxy", "name": "HTTP via Proxy", "description": "Check HTTP through a proxy server"},
            {"id": "dns", "name": "DNS Resolution", "description": "Check DNS record resolution"},
            {"id": "file", "name": "File Availability", "description": "Check if a file is downloadable"},
        ]
    }


@router.get("/agents")
async def get_available_agents(
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get list of available agents for check assignment."""
    monitoring_service = MonitoringService(db)
    agents = await monitoring_service.get_all_agents()

    return {
        "agents": [
            {"hostname": "any", "status": "available", "description": "Round-robin across all agents"},
        ] + [
            {"hostname": a.hostname, "status": a.status, "last_seen": a.last_seen.isoformat() if a.last_seen else None}
            for a in agents
        ]
    }


@router.post("", response_model=ServiceCheckSchema)
async def create_check(
    check_data: ServiceCheckCreate,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Create a new service check."""
    # Validate check type
    valid_types = [t.value for t in ServiceCheckType]
    if check_data.check_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid check type. Must be one of: {valid_types}"
        )

    service = ServiceCheckService(db)
    check = await service.create_check(
        name=check_data.name,
        description=check_data.description,
        check_type=check_data.check_type,
        target=check_data.target,
        expected_status_code=check_data.expected_status_code,
        expected_content=check_data.expected_content,
        proxy_address=check_data.proxy_address,
        dns_server=check_data.dns_server,
        expected_ip=check_data.expected_ip,
        dns_record_type=check_data.dns_record_type,
        timeout_seconds=check_data.timeout_seconds,
        interval_seconds=check_data.interval_seconds,
        failure_threshold=check_data.failure_threshold,
        alert_interval_hours=check_data.alert_interval_hours,
        assigned_agent=check_data.assigned_agent if check_data.assigned_agent != "any" else None,
    )

    return check_to_schema(check)


@router.get("/{check_id}", response_model=ServiceCheckSchema)
async def get_check(
    check_id: int,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get a specific service check."""
    service = ServiceCheckService(db)
    check = await service.get_check(check_id)

    if not check:
        raise HTTPException(status_code=404, detail="Check not found")

    return check_to_schema(check)


@router.put("/{check_id}", response_model=ServiceCheckSchema)
async def update_check(
    check_id: int,
    check_data: ServiceCheckUpdate,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Update a service check."""
    service = ServiceCheckService(db)

    # Convert "any" to None for assigned_agent
    update_data = check_data.model_dump(exclude_unset=True)
    if 'assigned_agent' in update_data and update_data['assigned_agent'] == 'any':
        update_data['assigned_agent'] = None

    check = await service.update_check(check_id, **update_data)

    if not check:
        raise HTTPException(status_code=404, detail="Check not found")

    return check_to_schema(check)


@router.delete("/{check_id}")
async def delete_check(
    check_id: int,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Delete a service check."""
    service = ServiceCheckService(db)
    deleted = await service.delete_check(check_id)

    if not deleted:
        raise HTTPException(status_code=404, detail="Check not found")

    return {"message": "Check deleted successfully"}


# ==================== Results Endpoints ====================

@router.get("/{check_id}/results", response_model=list[ServiceCheckResultSchema])
async def get_check_results(
    check_id: int,
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get recent results for a service check."""
    service = ServiceCheckService(db)
    check = await service.get_check(check_id)

    if not check:
        raise HTTPException(status_code=404, detail="Check not found")

    results = await service.get_check_results(check_id, limit=limit)
    return [result_to_schema(r) for r in results]


@router.get("/{check_id}/uptime", response_model=dict[str, UptimeStatsSchema])
async def get_check_uptime(
    check_id: int,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get uptime statistics for various time periods."""
    service = ServiceCheckService(db)
    check = await service.get_check(check_id)

    if not check:
        raise HTTPException(status_code=404, detail="Check not found")

    periods = {
        "24h": await service.calculate_uptime(check_id, hours=24),
        "7d": await service.calculate_uptime(check_id, hours=24 * 7),
        "30d": await service.calculate_uptime(check_id, hours=24 * 30),
        "90d": await service.calculate_uptime(check_id, hours=24 * 90),
    }

    return {
        period: UptimeStatsSchema(**stats)
        for period, stats in periods.items()
    }


@router.get("/{check_id}/history", response_model=list[DailyUptimeSchema])
async def get_check_history(
    check_id: int,
    days: int = Query(90, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Get daily history for uptime grid visualization."""
    service = ServiceCheckService(db)
    check = await service.get_check(check_id)

    if not check:
        raise HTTPException(status_code=404, detail="Check not found")

    history = await service.get_check_history_for_uptime(check_id, days=days)
    return [DailyUptimeSchema(**h) for h in history]


# ==================== Enable/Disable Endpoints ====================

@router.post("/{check_id}/enable")
async def enable_check(
    check_id: int,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Enable a service check."""
    service = ServiceCheckService(db)
    check = await service.update_check(check_id, is_enabled=True)

    if not check:
        raise HTTPException(status_code=404, detail="Check not found")

    return {"message": "Check enabled", "is_enabled": True}


@router.post("/{check_id}/disable")
async def disable_check(
    check_id: int,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Disable a service check."""
    service = ServiceCheckService(db)
    check = await service.update_check(check_id, is_enabled=False)

    if not check:
        raise HTTPException(status_code=404, detail="Check not found")

    return {"message": "Check disabled", "is_enabled": False}


# ==================== Run Check Manually ====================

@router.post("/{check_id}/run")
async def run_check_now(
    check_id: int,
    db: AsyncSession = Depends(get_db),
    session: Session = Depends(get_current_session),
):
    """Trigger an immediate check execution (queued to next available agent)."""
    service = ServiceCheckService(db)
    check = await service.get_check(check_id)

    if not check:
        raise HTTPException(status_code=404, detail="Check not found")

    # Reset last_check_time to make it due immediately
    check.last_check_time = None
    await db.commit()

    return {"message": "Check queued for execution"}
