"""Background service for checking alert conditions and sending notifications."""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import AlertRule, AlertHistory, AlertSettings, AlertType
from ..models.database import get_db
from .prometheus import get_prometheus_service
from .notifications import get_notification_service

logger = logging.getLogger(__name__)


class AlertChecker:
    """Background service that periodically checks alert conditions."""

    def __init__(self):
        self._running = False
        self._task: Optional[asyncio.Task] = None

    async def start(self):
        """Start the alert checker background task."""
        if self._running:
            return

        self._running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info("Alert checker started")

    async def stop(self):
        """Stop the alert checker."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Alert checker stopped")

    async def _run_loop(self):
        """Main loop that checks alerts periodically."""
        while self._running:
            try:
                wait_time = 60  # Default wait time

                async for db in get_db():
                    # Get settings
                    result = await db.execute(
                        select(AlertSettings).where(AlertSettings.key == "global")
                    )
                    settings = result.scalar_one_or_none()

                    if not settings or not settings.alerts_enabled:
                        wait_time = 60
                        break

                    wait_time = settings.check_interval_seconds

                    # Check if in quiet hours
                    if settings.quiet_hours_enabled:
                        current_hour = datetime.utcnow().hour
                        start = settings.quiet_hours_start or 0
                        end = settings.quiet_hours_end or 0

                        if start <= current_hour < end:
                            logger.debug("In quiet hours, skipping alert check")
                            break

                    # Run alert checks
                    await self._check_all_alerts(db, settings)
                    break  # Exit the generator loop

                # Wait for next check
                await asyncio.sleep(wait_time)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Alert checker error: {e}")
                await asyncio.sleep(60)

    async def _check_all_alerts(self, db: AsyncSession, settings: AlertSettings):
        """Check all enabled alert rules."""
        # Get enabled rules
        result = await db.execute(
            select(AlertRule).where(AlertRule.enabled == True)
        )
        rules = result.scalars().all()

        prometheus = get_prometheus_service()

        for rule in rules:
            try:
                await self._check_rule(db, rule, settings, prometheus)
            except Exception as e:
                logger.error(f"Error checking rule {rule.name}: {e}")

    async def _check_rule(
        self,
        db: AsyncSession,
        rule: AlertRule,
        settings: AlertSettings,
        prometheus
    ):
        """Check a single alert rule."""
        # Check cooldown - don't re-alert too frequently
        cooldown_time = datetime.utcnow() - timedelta(minutes=rule.cooldown_minutes)
        result = await db.execute(
            select(AlertHistory)
            .where(AlertHistory.rule_id == rule.id)
            .where(AlertHistory.triggered_at >= cooldown_time)
            .where(AlertHistory.is_resolved == False)
        )
        recent_alerts = result.scalars().all()

        alert_type = rule.alert_type
        conditions = rule.conditions or {}

        # Host metric alerts
        if alert_type in [AlertType.CPU_HIGH.value, AlertType.MEMORY_HIGH.value,
                          AlertType.DISK_HIGH.value, AlertType.LOAD_HIGH.value]:
            await self._check_host_metrics(db, rule, settings, prometheus, recent_alerts)

        # Host down alerts
        elif alert_type == AlertType.HOST_DOWN.value:
            await self._check_host_down(db, rule, settings, prometheus, recent_alerts)

        # Agent offline alerts
        elif alert_type == AlertType.AGENT_OFFLINE.value:
            await self._check_agent_offline(db, rule, settings, recent_alerts)

    async def _check_host_metrics(
        self,
        db: AsyncSession,
        rule: AlertRule,
        settings: AlertSettings,
        prometheus,
        recent_alerts: list[AlertHistory]
    ):
        """Check host metric thresholds."""
        alert_type = rule.alert_type
        conditions = rule.conditions or {}

        # Determine threshold
        if alert_type == AlertType.CPU_HIGH.value:
            threshold = conditions.get("threshold", settings.default_cpu_threshold)
            metric_key = "cpu_usage_percent"
            metric_name = "CPU"
        elif alert_type == AlertType.MEMORY_HIGH.value:
            threshold = conditions.get("threshold", settings.default_memory_threshold)
            metric_key = "memory_usage_percent"
            metric_name = "Memory"
        elif alert_type == AlertType.DISK_HIGH.value:
            threshold = conditions.get("threshold", settings.default_disk_threshold)
            metric_key = "disk_usage_percent"
            metric_name = "Disk"
        elif alert_type == AlertType.LOAD_HIGH.value:
            threshold = conditions.get("threshold", settings.default_load_threshold)
            metric_key = "load_average_1m"
            metric_name = "Load"
        else:
            return

        # Get all host metrics
        all_metrics = await prometheus.get_all_host_metrics()

        for host_metrics in all_metrics:
            hostname = host_metrics.hostname
            instance = host_metrics.instance

            # Check host filter
            if rule.host_filter:
                if hostname not in rule.host_filter and instance not in rule.host_filter:
                    continue

            # Get metric value
            metric_value = getattr(host_metrics, metric_key, None)
            if metric_value is None:
                continue

            # Check if already alerted for this host
            already_alerted = any(
                a.hostname == hostname or a.hostname == instance
                for a in recent_alerts
            )
            if already_alerted:
                continue

            # Check threshold
            if metric_value >= threshold:
                await self._trigger_alert(
                    db=db,
                    rule=rule,
                    settings=settings,
                    hostname=instance,
                    message=f"{metric_name} usage on {hostname} is at {metric_value:.1f}% (threshold: {threshold:.1f}%)",
                    metric_value=metric_value,
                    threshold_value=threshold,
                )

    async def _check_host_down(
        self,
        db: AsyncSession,
        rule: AlertRule,
        settings: AlertSettings,
        prometheus,
        recent_alerts: list[AlertHistory]
    ):
        """Check for hosts that are down."""
        # Query Prometheus for down hosts
        results = await prometheus.query('up{instance=~".*:9100"} == 0')

        for result in results:
            instance = result.get("metric", {}).get("instance", "")
            hostname = instance.split(":")[0]

            # Check host filter
            if rule.host_filter:
                if hostname not in rule.host_filter and instance not in rule.host_filter:
                    continue

            # Check if already alerted
            already_alerted = any(
                a.hostname == hostname or a.hostname == instance
                for a in recent_alerts
            )
            if already_alerted:
                continue

            await self._trigger_alert(
                db=db,
                rule=rule,
                settings=settings,
                hostname=instance,
                message=f"Host {hostname} ({instance}) is down",
                metric_value=0,
                threshold_value=1,
            )

    async def _check_agent_offline(
        self,
        db: AsyncSession,
        rule: AlertRule,
        settings: AlertSettings,
        recent_alerts: list[AlertHistory]
    ):
        """Check for offline agents."""
        from ..models import Agent, AgentStatus

        # Get agents that are offline
        result = await db.execute(
            select(Agent).where(Agent.status == AgentStatus.OFFLINE.value)
        )
        offline_agents = result.scalars().all()

        for agent in offline_agents:
            # Check host filter
            if rule.host_filter:
                if agent.hostname not in rule.host_filter:
                    continue

            # Check if already alerted
            already_alerted = any(
                a.hostname == agent.hostname
                for a in recent_alerts
            )
            if already_alerted:
                continue

            await self._trigger_alert(
                db=db,
                rule=rule,
                settings=settings,
                hostname=agent.hostname,
                message=f"Agent {agent.hostname} is offline (last seen: {agent.last_seen})",
                metric_value=None,
                threshold_value=None,
            )

    async def _trigger_alert(
        self,
        db: AsyncSession,
        rule: AlertRule,
        settings: AlertSettings,
        hostname: str,
        message: str,
        metric_value: Optional[float],
        threshold_value: Optional[float],
    ):
        """Trigger an alert and send notifications."""
        logger.warning(f"Alert triggered: {rule.name} - {message}")

        notification_service = get_notification_service()

        # Send Discord notification
        discord_sent = False
        if rule.notify_discord and settings.discord_enabled and settings.discord_webhook_url:
            discord_sent = await notification_service.send_discord(
                webhook_url=settings.discord_webhook_url,
                title=rule.name,
                message=message,
                severity=rule.severity,
                hostname=hostname,
                metric_value=metric_value,
                threshold_value=threshold_value,
                alert_type=rule.alert_type,
            )

        # Send Email notification
        email_sent = False
        if rule.notify_email and settings.email_enabled and settings.email_recipients:
            email_sent = await notification_service.send_email(
                recipients=settings.email_recipients,
                subject=f"[{rule.severity.upper()}] {rule.name}",
                body=message,
            )

        # Log to alert history
        alert = AlertHistory(
            rule_id=rule.id,
            rule_name=rule.name,
            alert_type=rule.alert_type,
            severity=rule.severity,
            hostname=hostname,
            message=message,
            metric_value=metric_value,
            threshold_value=threshold_value,
            discord_sent=discord_sent,
            email_sent=email_sent,
        )

        db.add(alert)
        await db.commit()


# Global singleton
_alert_checker: Optional[AlertChecker] = None


def get_alert_checker() -> AlertChecker:
    """Get the global alert checker instance."""
    global _alert_checker
    if _alert_checker is None:
        _alert_checker = AlertChecker()
    return _alert_checker
