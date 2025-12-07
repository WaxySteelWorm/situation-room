"""Alert configuration and history API endpoints."""

import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import get_db, AlertRule, AlertHistory, AlertSettings, AlertSeverity, AlertType

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


# ==================== Pydantic Models ====================

class AlertSettingsUpdate(BaseModel):
    alerts_enabled: Optional[bool] = None
    discord_webhook_url: Optional[str] = None
    discord_enabled: Optional[bool] = None
    email_enabled: Optional[bool] = None
    email_recipients: Optional[list[str]] = None
    default_cpu_threshold: Optional[float] = None
    default_memory_threshold: Optional[float] = None
    default_disk_threshold: Optional[float] = None
    default_load_threshold: Optional[float] = None
    check_interval_seconds: Optional[int] = None
    quiet_hours_enabled: Optional[bool] = None
    quiet_hours_start: Optional[int] = None
    quiet_hours_end: Optional[int] = None


class AlertSettingsResponse(BaseModel):
    alerts_enabled: bool
    discord_webhook_url: Optional[str]
    discord_enabled: bool
    email_enabled: bool
    email_recipients: list[str]
    default_cpu_threshold: float
    default_memory_threshold: float
    default_disk_threshold: float
    default_load_threshold: float
    check_interval_seconds: int
    quiet_hours_enabled: bool
    quiet_hours_start: Optional[int]
    quiet_hours_end: Optional[int]


class AlertRuleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    alert_type: str
    enabled: bool = True
    severity: str = "warning"
    conditions: Optional[dict] = None
    host_filter: Optional[list[str]] = None
    notify_discord: bool = True
    notify_email: bool = False
    cooldown_minutes: int = 15


class AlertRuleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    enabled: Optional[bool] = None
    severity: Optional[str] = None
    conditions: Optional[dict] = None
    host_filter: Optional[list[str]] = None
    notify_discord: Optional[bool] = None
    notify_email: Optional[bool] = None
    cooldown_minutes: Optional[int] = None


class AlertRuleResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    alert_type: str
    enabled: bool
    severity: str
    conditions: Optional[dict]
    host_filter: Optional[list[str]]
    notify_discord: bool
    notify_email: bool
    cooldown_minutes: int
    created_at: datetime
    updated_at: datetime


class AlertHistoryResponse(BaseModel):
    id: int
    rule_id: Optional[int]
    rule_name: str
    alert_type: str
    severity: str
    hostname: Optional[str]
    message: str
    details: Optional[dict]
    metric_value: Optional[float]
    threshold_value: Optional[float]
    discord_sent: bool
    email_sent: bool
    is_resolved: bool
    resolved_at: Optional[datetime]
    triggered_at: datetime


# ==================== Settings Endpoints ====================

@router.get("/settings", response_model=AlertSettingsResponse)
async def get_alert_settings(db: AsyncSession = Depends(get_db)):
    """Get global alert settings."""
    result = await db.execute(
        select(AlertSettings).where(AlertSettings.key == "global")
    )
    settings = result.scalar_one_or_none()

    if not settings:
        # Create default settings
        settings = AlertSettings(key="global")
        db.add(settings)
        await db.commit()
        await db.refresh(settings)

    return AlertSettingsResponse(
        alerts_enabled=settings.alerts_enabled,
        discord_webhook_url=settings.discord_webhook_url,
        discord_enabled=settings.discord_enabled,
        email_enabled=settings.email_enabled,
        email_recipients=settings.email_recipients or [],
        default_cpu_threshold=settings.default_cpu_threshold,
        default_memory_threshold=settings.default_memory_threshold,
        default_disk_threshold=settings.default_disk_threshold,
        default_load_threshold=settings.default_load_threshold,
        check_interval_seconds=settings.check_interval_seconds,
        quiet_hours_enabled=settings.quiet_hours_enabled,
        quiet_hours_start=settings.quiet_hours_start,
        quiet_hours_end=settings.quiet_hours_end,
    )


@router.put("/settings", response_model=AlertSettingsResponse)
async def update_alert_settings(
    update: AlertSettingsUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update global alert settings."""
    result = await db.execute(
        select(AlertSettings).where(AlertSettings.key == "global")
    )
    settings = result.scalar_one_or_none()

    if not settings:
        settings = AlertSettings(key="global")
        db.add(settings)

    # Update fields
    if update.alerts_enabled is not None:
        settings.alerts_enabled = update.alerts_enabled
    if update.discord_webhook_url is not None:
        settings.discord_webhook_url = update.discord_webhook_url
    if update.discord_enabled is not None:
        settings.discord_enabled = update.discord_enabled
    if update.email_enabled is not None:
        settings.email_enabled = update.email_enabled
    if update.email_recipients is not None:
        settings.email_recipients = update.email_recipients
    if update.default_cpu_threshold is not None:
        settings.default_cpu_threshold = update.default_cpu_threshold
    if update.default_memory_threshold is not None:
        settings.default_memory_threshold = update.default_memory_threshold
    if update.default_disk_threshold is not None:
        settings.default_disk_threshold = update.default_disk_threshold
    if update.default_load_threshold is not None:
        settings.default_load_threshold = update.default_load_threshold
    if update.check_interval_seconds is not None:
        settings.check_interval_seconds = update.check_interval_seconds
    if update.quiet_hours_enabled is not None:
        settings.quiet_hours_enabled = update.quiet_hours_enabled
    if update.quiet_hours_start is not None:
        settings.quiet_hours_start = update.quiet_hours_start
    if update.quiet_hours_end is not None:
        settings.quiet_hours_end = update.quiet_hours_end

    await db.commit()
    await db.refresh(settings)

    return AlertSettingsResponse(
        alerts_enabled=settings.alerts_enabled,
        discord_webhook_url=settings.discord_webhook_url,
        discord_enabled=settings.discord_enabled,
        email_enabled=settings.email_enabled,
        email_recipients=settings.email_recipients or [],
        default_cpu_threshold=settings.default_cpu_threshold,
        default_memory_threshold=settings.default_memory_threshold,
        default_disk_threshold=settings.default_disk_threshold,
        default_load_threshold=settings.default_load_threshold,
        check_interval_seconds=settings.check_interval_seconds,
        quiet_hours_enabled=settings.quiet_hours_enabled,
        quiet_hours_start=settings.quiet_hours_start,
        quiet_hours_end=settings.quiet_hours_end,
    )


# ==================== Alert Rules Endpoints ====================

@router.get("/rules", response_model=list[AlertRuleResponse])
async def list_alert_rules(db: AsyncSession = Depends(get_db)):
    """List all alert rules."""
    result = await db.execute(
        select(AlertRule).order_by(AlertRule.name)
    )
    rules = result.scalars().all()

    return [
        AlertRuleResponse(
            id=r.id,
            name=r.name,
            description=r.description,
            alert_type=r.alert_type,
            enabled=r.enabled,
            severity=r.severity,
            conditions=r.conditions,
            host_filter=r.host_filter,
            notify_discord=r.notify_discord,
            notify_email=r.notify_email,
            cooldown_minutes=r.cooldown_minutes,
            created_at=r.created_at,
            updated_at=r.updated_at,
        )
        for r in rules
    ]


@router.post("/rules", response_model=AlertRuleResponse)
async def create_alert_rule(
    rule: AlertRuleCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new alert rule."""
    # Validate alert type
    valid_types = [t.value for t in AlertType]
    if rule.alert_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid alert type. Must be one of: {valid_types}"
        )

    # Validate severity
    valid_severities = [s.value for s in AlertSeverity]
    if rule.severity not in valid_severities:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid severity. Must be one of: {valid_severities}"
        )

    new_rule = AlertRule(
        name=rule.name,
        description=rule.description,
        alert_type=rule.alert_type,
        enabled=rule.enabled,
        severity=rule.severity,
        conditions=rule.conditions,
        host_filter=rule.host_filter,
        notify_discord=rule.notify_discord,
        notify_email=rule.notify_email,
        cooldown_minutes=rule.cooldown_minutes,
    )

    db.add(new_rule)
    await db.commit()
    await db.refresh(new_rule)

    return AlertRuleResponse(
        id=new_rule.id,
        name=new_rule.name,
        description=new_rule.description,
        alert_type=new_rule.alert_type,
        enabled=new_rule.enabled,
        severity=new_rule.severity,
        conditions=new_rule.conditions,
        host_filter=new_rule.host_filter,
        notify_discord=new_rule.notify_discord,
        notify_email=new_rule.notify_email,
        cooldown_minutes=new_rule.cooldown_minutes,
        created_at=new_rule.created_at,
        updated_at=new_rule.updated_at,
    )


@router.put("/rules/{rule_id}", response_model=AlertRuleResponse)
async def update_alert_rule(
    rule_id: int,
    update: AlertRuleUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update an alert rule."""
    result = await db.execute(
        select(AlertRule).where(AlertRule.id == rule_id)
    )
    rule = result.scalar_one_or_none()

    if not rule:
        raise HTTPException(status_code=404, detail="Alert rule not found")

    if update.name is not None:
        rule.name = update.name
    if update.description is not None:
        rule.description = update.description
    if update.enabled is not None:
        rule.enabled = update.enabled
    if update.severity is not None:
        valid_severities = [s.value for s in AlertSeverity]
        if update.severity not in valid_severities:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid severity. Must be one of: {valid_severities}"
            )
        rule.severity = update.severity
    if update.conditions is not None:
        rule.conditions = update.conditions
    if update.host_filter is not None:
        rule.host_filter = update.host_filter
    if update.notify_discord is not None:
        rule.notify_discord = update.notify_discord
    if update.notify_email is not None:
        rule.notify_email = update.notify_email
    if update.cooldown_minutes is not None:
        rule.cooldown_minutes = update.cooldown_minutes

    await db.commit()
    await db.refresh(rule)

    return AlertRuleResponse(
        id=rule.id,
        name=rule.name,
        description=rule.description,
        alert_type=rule.alert_type,
        enabled=rule.enabled,
        severity=rule.severity,
        conditions=rule.conditions,
        host_filter=rule.host_filter,
        notify_discord=rule.notify_discord,
        notify_email=rule.notify_email,
        cooldown_minutes=rule.cooldown_minutes,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


@router.delete("/rules/{rule_id}")
async def delete_alert_rule(
    rule_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Delete an alert rule."""
    result = await db.execute(
        select(AlertRule).where(AlertRule.id == rule_id)
    )
    rule = result.scalar_one_or_none()

    if not rule:
        raise HTTPException(status_code=404, detail="Alert rule not found")

    await db.delete(rule)
    await db.commit()

    return {"status": "deleted"}


# ==================== Alert History Endpoints ====================

@router.get("/history", response_model=list[AlertHistoryResponse])
async def list_alert_history(
    limit: int = 100,
    offset: int = 0,
    unresolved_only: bool = False,
    hostname: Optional[str] = None,
    severity: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """List alert history."""
    query = select(AlertHistory).order_by(desc(AlertHistory.triggered_at))

    if unresolved_only:
        query = query.where(AlertHistory.is_resolved == False)
    if hostname:
        query = query.where(AlertHistory.hostname == hostname)
    if severity:
        query = query.where(AlertHistory.severity == severity)

    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    alerts = result.scalars().all()

    return [
        AlertHistoryResponse(
            id=a.id,
            rule_id=a.rule_id,
            rule_name=a.rule_name,
            alert_type=a.alert_type,
            severity=a.severity,
            hostname=a.hostname,
            message=a.message,
            details=a.details,
            metric_value=a.metric_value,
            threshold_value=a.threshold_value,
            discord_sent=a.discord_sent,
            email_sent=a.email_sent,
            is_resolved=a.is_resolved,
            resolved_at=a.resolved_at,
            triggered_at=a.triggered_at,
        )
        for a in alerts
    ]


@router.post("/history/{alert_id}/resolve")
async def resolve_alert(
    alert_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Mark an alert as resolved."""
    result = await db.execute(
        select(AlertHistory).where(AlertHistory.id == alert_id)
    )
    alert = result.scalar_one_or_none()

    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.is_resolved = True
    alert.resolved_at = datetime.utcnow()
    await db.commit()

    return {"status": "resolved"}


@router.get("/types")
async def list_alert_types():
    """List available alert types."""
    return [
        {"value": AlertType.CPU_HIGH.value, "label": "CPU High", "category": "host"},
        {"value": AlertType.MEMORY_HIGH.value, "label": "Memory High", "category": "host"},
        {"value": AlertType.DISK_HIGH.value, "label": "Disk High", "category": "host"},
        {"value": AlertType.LOAD_HIGH.value, "label": "Load High", "category": "host"},
        {"value": AlertType.HOST_DOWN.value, "label": "Host Down", "category": "host"},
        {"value": AlertType.THREAT_SPIKE.value, "label": "Threat Spike", "category": "threat"},
        {"value": AlertType.NEW_COUNTRY.value, "label": "New Country", "category": "threat"},
        {"value": AlertType.PORT_SCAN.value, "label": "Port Scan Detected", "category": "threat"},
        {"value": AlertType.AGENT_OFFLINE.value, "label": "Agent Offline", "category": "agent"},
    ]


@router.get("/severities")
async def list_severities():
    """List available severity levels."""
    return [
        {"value": AlertSeverity.INFO.value, "label": "Info", "color": "blue"},
        {"value": AlertSeverity.WARNING.value, "label": "Warning", "color": "amber"},
        {"value": AlertSeverity.CRITICAL.value, "label": "Critical", "color": "red"},
    ]


@router.post("/test")
async def test_notification(
    channel: str,
    db: AsyncSession = Depends(get_db)
):
    """Send a test notification to verify configuration."""
    from ..services.notifications import get_notification_service

    result = await db.execute(
        select(AlertSettings).where(AlertSettings.key == "global")
    )
    settings = result.scalar_one_or_none()

    if not settings:
        raise HTTPException(status_code=400, detail="Alert settings not configured")

    notification_service = get_notification_service()

    if channel == "discord":
        if not settings.discord_webhook_url:
            raise HTTPException(status_code=400, detail="Discord webhook URL not configured")

        success = await notification_service.send_discord(
            webhook_url=settings.discord_webhook_url,
            title="Test Notification",
            message="This is a test notification from Situation Room.",
            severity="info",
        )
        if success:
            return {"status": "sent", "channel": "discord"}
        else:
            raise HTTPException(status_code=500, detail="Failed to send Discord notification")

    elif channel == "email":
        raise HTTPException(status_code=501, detail="Email notifications not yet implemented")

    else:
        raise HTTPException(status_code=400, detail="Invalid channel. Use 'discord' or 'email'")
