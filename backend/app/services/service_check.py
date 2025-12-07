"""Service check service for managing and executing service checks."""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Any, Optional

from sqlalchemy import delete, func, select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import (
    Agent,
    ServiceCheck,
    ServiceCheckResult,
    ServiceCheckAlert,
    ServiceCheckType,
    ServiceCheckStatus,
)
from .notification import NotificationService
from .websocket_manager import get_websocket_manager

logger = logging.getLogger(__name__)


class ServiceCheckService:
    """Service for managing service checks."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.ws_manager = get_websocket_manager()
        self.notification_service = NotificationService()

    # ==================== Check CRUD ====================

    async def create_check(
        self,
        name: str,
        check_type: str,
        target: str,
        description: Optional[str] = None,
        expected_status_code: Optional[int] = None,
        expected_content: Optional[str] = None,
        proxy_address: Optional[str] = None,
        dns_server: Optional[str] = None,
        expected_ip: Optional[str] = None,
        dns_record_type: Optional[str] = None,
        timeout_seconds: int = 30,
        interval_seconds: int = 300,
        failure_threshold: int = 2,
        alert_interval_hours: int = 6,
        assigned_agent: Optional[str] = None,
    ) -> ServiceCheck:
        """Create a new service check."""
        check = ServiceCheck(
            name=name,
            description=description,
            check_type=check_type,
            target=target,
            expected_status_code=expected_status_code,
            expected_content=expected_content,
            proxy_address=proxy_address,
            dns_server=dns_server,
            expected_ip=expected_ip,
            dns_record_type=dns_record_type,
            timeout_seconds=timeout_seconds,
            interval_seconds=interval_seconds,
            failure_threshold=failure_threshold,
            alert_interval_hours=alert_interval_hours,
            assigned_agent=assigned_agent,
            current_status=ServiceCheckStatus.UNKNOWN.value,
        )

        self.db.add(check)
        await self.db.commit()
        await self.db.refresh(check)
        return check

    async def update_check(
        self,
        check_id: int,
        **kwargs
    ) -> Optional[ServiceCheck]:
        """Update an existing service check."""
        result = await self.db.execute(
            select(ServiceCheck).where(ServiceCheck.id == check_id)
        )
        check = result.scalar_one_or_none()

        if not check:
            return None

        # Update allowed fields
        allowed_fields = {
            'name', 'description', 'check_type', 'target', 'is_enabled',
            'expected_status_code', 'expected_content', 'proxy_address',
            'dns_server', 'expected_ip', 'dns_record_type', 'timeout_seconds',
            'interval_seconds', 'failure_threshold', 'alert_interval_hours',
            'assigned_agent'
        }

        for field, value in kwargs.items():
            if field in allowed_fields:
                setattr(check, field, value)

        await self.db.commit()
        await self.db.refresh(check)
        return check

    async def delete_check(self, check_id: int) -> bool:
        """Delete a service check and its results."""
        result = await self.db.execute(
            select(ServiceCheck).where(ServiceCheck.id == check_id)
        )
        check = result.scalar_one_or_none()

        if not check:
            return False

        # Delete associated results
        await self.db.execute(
            delete(ServiceCheckResult).where(ServiceCheckResult.check_id == check_id)
        )

        # Delete associated alerts
        await self.db.execute(
            delete(ServiceCheckAlert).where(ServiceCheckAlert.check_id == check_id)
        )

        # Delete the check
        await self.db.delete(check)
        await self.db.commit()
        return True

    async def get_check(self, check_id: int) -> Optional[ServiceCheck]:
        """Get a service check by ID."""
        result = await self.db.execute(
            select(ServiceCheck).where(ServiceCheck.id == check_id)
        )
        return result.scalar_one_or_none()

    async def get_all_checks(self, include_disabled: bool = False) -> list[ServiceCheck]:
        """Get all service checks."""
        query = select(ServiceCheck)
        if not include_disabled:
            query = query.where(ServiceCheck.is_enabled == True)
        query = query.order_by(ServiceCheck.name)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_checks_by_status(self, status: str) -> list[ServiceCheck]:
        """Get checks by their current status."""
        result = await self.db.execute(
            select(ServiceCheck)
            .where(ServiceCheck.current_status == status)
            .order_by(ServiceCheck.name)
        )
        return list(result.scalars().all())

    # ==================== Check Results ====================

    async def record_result(
        self,
        check_id: int,
        agent_hostname: str,
        is_success: bool,
        check_time: datetime,
        latency_ms: Optional[float] = None,
        status_code: Optional[int] = None,
        response_body: Optional[str] = None,
        error_message: Optional[str] = None,
    ) -> ServiceCheckResult:
        """Record a check result and update check state."""
        # Create the result
        result = ServiceCheckResult(
            check_id=check_id,
            agent_hostname=agent_hostname,
            is_success=is_success,
            latency_ms=latency_ms,
            status_code=status_code,
            response_body=response_body[:1024] if response_body else None,  # Truncate
            error_message=error_message,
            check_time=check_time,
        )

        self.db.add(result)

        # Update the check state
        check = await self.get_check(check_id)
        if check:
            check.last_check_time = check_time
            check.last_latency_ms = latency_ms

            if is_success:
                check.last_success_time = check_time
                was_alerting = check.is_alerting

                # Reset consecutive failures
                check.consecutive_failures = 0
                check.current_status = ServiceCheckStatus.PASSING.value

                # Send recovery notification if was alerting
                if was_alerting:
                    check.is_alerting = False
                    await self._send_recovery_alert(check)
            else:
                check.last_failure_time = check_time
                check.consecutive_failures += 1
                check.current_status = ServiceCheckStatus.FAILING.value

                # Check if we should alert
                await self._check_and_send_failure_alert(check, error_message)

        await self.db.commit()
        await self.db.refresh(result)
        return result

    async def get_check_results(
        self,
        check_id: int,
        limit: int = 100,
        since: Optional[datetime] = None,
    ) -> list[ServiceCheckResult]:
        """Get results for a specific check."""
        query = select(ServiceCheckResult).where(
            ServiceCheckResult.check_id == check_id
        )

        if since:
            query = query.where(ServiceCheckResult.check_time >= since)

        query = query.order_by(ServiceCheckResult.check_time.desc()).limit(limit)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_check_history_for_uptime(
        self,
        check_id: int,
        days: int = 90,
    ) -> list[dict[str, Any]]:
        """Get daily aggregated results for uptime grid visualization."""
        since = datetime.utcnow() - timedelta(days=days)

        # Get daily success/failure counts
        result = await self.db.execute(
            select(
                func.date(ServiceCheckResult.check_time).label('date'),
                func.count(ServiceCheckResult.id).label('total'),
                func.sum(
                    func.cast(ServiceCheckResult.is_success, Integer)
                ).label('success_count'),
            )
            .where(ServiceCheckResult.check_id == check_id)
            .where(ServiceCheckResult.check_time >= since)
            .group_by(func.date(ServiceCheckResult.check_time))
            .order_by(func.date(ServiceCheckResult.check_time))
        )

        daily_stats = []
        for row in result:
            total = row.total
            success = row.success_count or 0
            daily_stats.append({
                'date': row.date.isoformat() if hasattr(row.date, 'isoformat') else str(row.date),
                'total': total,
                'success': success,
                'failure': total - success,
                'uptime_pct': (success / total * 100) if total > 0 else None,
            })

        return daily_stats

    async def calculate_uptime(
        self,
        check_id: int,
        hours: int = 24,
    ) -> dict[str, Any]:
        """Calculate uptime percentage for a time period."""
        since = datetime.utcnow() - timedelta(hours=hours)

        result = await self.db.execute(
            select(
                func.count(ServiceCheckResult.id).label('total'),
                func.sum(
                    func.cast(ServiceCheckResult.is_success, Integer)
                ).label('success_count'),
            )
            .where(ServiceCheckResult.check_id == check_id)
            .where(ServiceCheckResult.check_time >= since)
        )

        row = result.first()
        total = row.total if row else 0
        success = row.success_count if row and row.success_count else 0

        return {
            'total_checks': total,
            'successful_checks': success,
            'failed_checks': total - success,
            'uptime_pct': (success / total * 100) if total > 0 else None,
            'period_hours': hours,
        }

    # ==================== Check Summary ====================

    async def get_summary(self) -> dict[str, Any]:
        """Get summary of all service checks."""
        # Count by status
        result = await self.db.execute(
            select(
                ServiceCheck.current_status,
                func.count(ServiceCheck.id).label('count')
            )
            .where(ServiceCheck.is_enabled == True)
            .group_by(ServiceCheck.current_status)
        )

        status_counts = {
            ServiceCheckStatus.PASSING.value: 0,
            ServiceCheckStatus.FAILING.value: 0,
            ServiceCheckStatus.UNKNOWN.value: 0,
        }

        for row in result:
            if row.current_status in status_counts:
                status_counts[row.current_status] = row.count

        total = sum(status_counts.values())

        return {
            'total': total,
            'passing': status_counts[ServiceCheckStatus.PASSING.value],
            'failing': status_counts[ServiceCheckStatus.FAILING.value],
            'unknown': status_counts[ServiceCheckStatus.UNKNOWN.value],
        }

    # ==================== Check Scheduling ====================

    async def get_checks_due_for_execution(self) -> list[ServiceCheck]:
        """Get checks that are due for execution."""
        now = datetime.utcnow()

        result = await self.db.execute(
            select(ServiceCheck)
            .where(ServiceCheck.is_enabled == True)
            .where(
                (ServiceCheck.last_check_time == None) |
                (
                    ServiceCheck.last_check_time <
                    now - func.cast(ServiceCheck.interval_seconds, Integer) * 1
                )
            )
        )

        # Filter by interval (SQLite doesn't support interval arithmetic well)
        checks = []
        for check in result.scalars().all():
            if check.last_check_time is None:
                checks.append(check)
            else:
                time_since_last = (now - check.last_check_time).total_seconds()
                if time_since_last >= check.interval_seconds:
                    checks.append(check)

        return checks

    async def get_check_assignments(self) -> dict[str, list[dict[str, Any]]]:
        """
        Get check assignments organized by agent.

        Returns a dict mapping agent hostname to list of check configs.
        Checks with assigned_agent=None are distributed to 'any'.
        """
        checks = await self.get_checks_due_for_execution()

        assignments: dict[str, list[dict[str, Any]]] = {}

        for check in checks:
            agent_key = check.assigned_agent or 'any'

            if agent_key not in assignments:
                assignments[agent_key] = []

            assignments[agent_key].append({
                'id': check.id,
                'name': check.name,
                'type': check.check_type,
                'target': check.target,
                'expected_status_code': check.expected_status_code,
                'expected_content': check.expected_content,
                'proxy_address': check.proxy_address,
                'dns_server': check.dns_server,
                'expected_ip': check.expected_ip,
                'dns_record_type': check.dns_record_type,
                'timeout_seconds': check.timeout_seconds,
            })

        return assignments

    # ==================== Alerting ====================

    async def _check_and_send_failure_alert(
        self,
        check: ServiceCheck,
        error_message: Optional[str] = None,
    ) -> None:
        """Check if we should send a failure alert and send it."""
        # Check if threshold reached
        if check.consecutive_failures < check.failure_threshold:
            return

        now = datetime.utcnow()

        # Check if we need to alert (first time or re-alert interval passed)
        should_alert = False
        if not check.is_alerting:
            # First time reaching threshold
            should_alert = True
            check.is_alerting = True
        elif check.last_alert_time:
            # Check re-alert interval
            hours_since_alert = (now - check.last_alert_time).total_seconds() / 3600
            if hours_since_alert >= check.alert_interval_hours:
                should_alert = True

        if should_alert:
            check.last_alert_time = now
            check.alert_count += 1

            # Record the alert
            message = f"Check '{check.name}' has failed {check.consecutive_failures} times. "
            if error_message:
                message += f"Error: {error_message}"
            else:
                message += f"Target: {check.target}"

            alert = ServiceCheckAlert(
                check_id=check.id,
                check_name=check.name,
                alert_type='failure',
                message=message,
                consecutive_failures=check.consecutive_failures,
                alert_time=now,
            )
            self.db.add(alert)

            # Send notifications
            await self._send_alert_notifications(check, message, 'failure', alert)

    async def _send_recovery_alert(self, check: ServiceCheck) -> None:
        """Send a recovery notification."""
        now = datetime.utcnow()
        message = f"Check '{check.name}' has recovered and is now passing. Target: {check.target}"

        alert = ServiceCheckAlert(
            check_id=check.id,
            check_name=check.name,
            alert_type='recovery',
            message=message,
            consecutive_failures=0,
            alert_time=now,
        )
        self.db.add(alert)

        await self._send_alert_notifications(check, message, 'recovery', alert)

    async def _send_alert_notifications(
        self,
        check: ServiceCheck,
        message: str,
        alert_type: str,
        alert: ServiceCheckAlert,
    ) -> None:
        """Send alert via configured channels."""
        from ..config import get_config
        config = get_config()

        # Discord notification
        if config.discord.enabled and config.discord.webhook_url:
            try:
                discord_sent = await self._send_discord_alert(check, message, alert_type)
                alert.discord_sent = discord_sent
            except Exception as e:
                logger.error(f"Failed to send Discord alert: {e}")

        # Email notification (using global config for now)
        if config.smtp.enabled:
            try:
                email_sent = await self._send_email_alert(check, message, alert_type)
                alert.email_sent = email_sent
            except Exception as e:
                logger.error(f"Failed to send email alert: {e}")

    async def _send_discord_alert(
        self,
        check: ServiceCheck,
        message: str,
        alert_type: str,
    ) -> bool:
        """Send a Discord webhook alert."""
        import httpx
        from ..config import get_config

        config = get_config()
        if not config.discord.webhook_url:
            return False

        color = 0xDC2626 if alert_type == 'failure' else 0x10B981  # Red or Green

        payload = {
            "embeds": [{
                "title": f"Service Check {'Alert' if alert_type == 'failure' else 'Recovery'}",
                "description": message,
                "color": color,
                "timestamp": datetime.utcnow().isoformat(),
                "footer": {"text": "Situation Room - Service Checks"},
                "fields": [
                    {"name": "Check Type", "value": check.check_type, "inline": True},
                    {"name": "Target", "value": check.target[:100], "inline": True},
                ]
            }]
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    config.discord.webhook_url,
                    json=payload,
                    timeout=10.0,
                )
                response.raise_for_status()
                logger.info(f"Discord service check alert sent: {check.name}")
                return True
        except Exception as e:
            logger.error(f"Failed to send Discord alert: {e}")
            return False

    async def _send_email_alert(
        self,
        check: ServiceCheck,
        message: str,
        alert_type: str,
    ) -> bool:
        """Send an email alert."""
        import aiosmtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        from ..config import get_config

        config = get_config()
        if not config.smtp.host:
            return False

        # For now, send to the first admin user's email
        admin_emails = [u.email for u in config.users if u.role == 'admin' and u.email]
        if not admin_emails:
            return False

        try:
            subject = f"[Situation Room] Service Check {'Alert' if alert_type == 'failure' else 'Recovery'}: {check.name}"

            for to_email in admin_emails:
                msg = MIMEMultipart("alternative")
                msg["Subject"] = subject
                msg["From"] = f"{config.smtp.from_name} <{config.smtp.from_email}>"
                msg["To"] = to_email

                text_part = MIMEText(message, "plain")
                msg.attach(text_part)

                html_body = f"""
                <html>
                <body style="font-family: Arial, sans-serif; padding: 20px;">
                    <div style="background-color: {'#dc2626' if alert_type == 'failure' else '#10b981'}; padding: 15px; border-radius: 8px; color: white;">
                        <h2 style="margin-top: 0;">Service Check {'Alert' if alert_type == 'failure' else 'Recovery'}</h2>
                    </div>
                    <div style="background-color: #1f2937; padding: 20px; border-radius: 8px; color: #e5e7eb; margin-top: 10px;">
                        <p><strong>Check:</strong> {check.name}</p>
                        <p><strong>Type:</strong> {check.check_type}</p>
                        <p><strong>Target:</strong> {check.target}</p>
                        <p style="margin-top: 15px;">{message}</p>
                    </div>
                </body>
                </html>
                """
                html_part = MIMEText(html_body, "html")
                msg.attach(html_part)

                await aiosmtplib.send(
                    msg,
                    hostname=config.smtp.host,
                    port=config.smtp.port,
                    username=config.smtp.username or None,
                    password=config.smtp.password or None,
                    use_tls=config.smtp.use_tls,
                )

            logger.info(f"Email service check alert sent: {check.name}")
            return True
        except Exception as e:
            logger.error(f"Failed to send email alert: {e}")
            return False

    # ==================== Data Retention ====================

    async def cleanup_old_results(self, retention_days: int = 365) -> int:
        """Delete check results older than retention period."""
        cutoff = datetime.utcnow() - timedelta(days=retention_days)

        result = await self.db.execute(
            delete(ServiceCheckResult).where(ServiceCheckResult.check_time < cutoff)
        )

        # Also clean up old alerts
        await self.db.execute(
            delete(ServiceCheckAlert).where(ServiceCheckAlert.alert_time < cutoff)
        )

        await self.db.commit()
        return result.rowcount if result.rowcount else 0
