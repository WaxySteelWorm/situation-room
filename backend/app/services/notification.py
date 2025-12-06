"""Notification service for Discord webhooks and email."""

import asyncio
import logging
from datetime import datetime
from typing import Optional
from enum import Enum

import httpx
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from ..config import get_config
from ..models.task import Task

logger = logging.getLogger(__name__)


class NotificationType(str, Enum):
    TASK_ASSIGNED = "task_assigned"
    DUE_DATE_APPROACHING = "due_date_approaching"
    NEW_COMMENT = "new_comment"
    STATUS_CHANGED = "status_changed"


class NotificationService:
    """Service for sending notifications via Discord and email."""

    def __init__(self):
        self.config = get_config()

    async def notify_task_assigned(
        self, task: Task, assigned_by: str, assignee_email: Optional[str] = None
    ) -> None:
        """Send notification when a task is assigned."""
        message = f"**Task Assigned**: {task.title}\n"
        message += f"Assigned to: {task.assignee}\n"
        message += f"Assigned by: {assigned_by}\n"
        if task.due_date:
            message += f"Due: {task.due_date.strftime('%Y-%m-%d %H:%M')}\n"
        message += f"Priority: {task.priority}"

        await self._send_discord(message, NotificationType.TASK_ASSIGNED)

        if assignee_email:
            subject = f"[Situation Room] Task Assigned: {task.title}"
            await self._send_email(assignee_email, subject, message)

    async def notify_due_date_approaching(
        self, task: Task, assignee_email: Optional[str] = None
    ) -> None:
        """Send notification when a task's due date is approaching."""
        message = f"**Due Date Approaching**: {task.title}\n"
        message += f"Assigned to: {task.assignee or 'Unassigned'}\n"
        if task.due_date:
            message += f"Due: {task.due_date.strftime('%Y-%m-%d %H:%M')}\n"
        message += f"Status: {task.status}"

        await self._send_discord(message, NotificationType.DUE_DATE_APPROACHING)

        if assignee_email:
            subject = f"[Situation Room] Due Soon: {task.title}"
            await self._send_email(assignee_email, subject, message)

    async def notify_new_comment(
        self,
        task: Task,
        comment_author: str,
        comment_content: str,
        assignee_email: Optional[str] = None,
    ) -> None:
        """Send notification when a new comment is added."""
        message = f"**New Comment** on: {task.title}\n"
        message += f"By: {comment_author}\n"
        message += f"Comment: {comment_content[:200]}{'...' if len(comment_content) > 200 else ''}"

        await self._send_discord(message, NotificationType.NEW_COMMENT)

        if assignee_email:
            subject = f"[Situation Room] New Comment: {task.title}"
            await self._send_email(assignee_email, subject, message)

    async def notify_status_changed(
        self,
        task: Task,
        old_status: str,
        new_status: str,
        changed_by: str,
        assignee_email: Optional[str] = None,
    ) -> None:
        """Send notification when a task's status changes."""
        message = f"**Status Changed**: {task.title}\n"
        message += f"From: {old_status} → {new_status}\n"
        message += f"Changed by: {changed_by}"

        await self._send_discord(message, NotificationType.STATUS_CHANGED)

        if assignee_email:
            subject = f"[Situation Room] Status Changed: {task.title}"
            await self._send_email(assignee_email, subject, message)

    async def _send_discord(
        self, message: str, notification_type: NotificationType
    ) -> bool:
        """Send a message to Discord webhook."""
        if not self.config.discord.enabled or not self.config.discord.webhook_url:
            logger.debug("Discord notifications disabled or webhook not configured")
            return False

        # Color based on notification type
        colors = {
            NotificationType.TASK_ASSIGNED: 0x3B82F6,  # Blue
            NotificationType.DUE_DATE_APPROACHING: 0xF59E0B,  # Amber
            NotificationType.NEW_COMMENT: 0x10B981,  # Green
            NotificationType.STATUS_CHANGED: 0x8B5CF6,  # Purple
        }

        payload = {
            "embeds": [
                {
                    "description": message,
                    "color": colors.get(notification_type, 0x6B7280),
                    "timestamp": datetime.utcnow().isoformat(),
                    "footer": {"text": "Situation Room"},
                }
            ]
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.config.discord.webhook_url,
                    json=payload,
                    timeout=10.0,
                )
                response.raise_for_status()
                logger.info(f"Discord notification sent: {notification_type.value}")
                return True
        except Exception as e:
            logger.error(f"Failed to send Discord notification: {e}")
            return False

    async def _send_email(self, to_email: str, subject: str, body: str) -> bool:
        """Send an email notification."""
        if not self.config.smtp.enabled or not self.config.smtp.host:
            logger.debug("Email notifications disabled or SMTP not configured")
            return False

        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"{self.config.smtp.from_name} <{self.config.smtp.from_email}>"
            msg["To"] = to_email

            # Plain text version
            text_part = MIMEText(body, "plain")
            msg.attach(text_part)

            # HTML version
            html_body = f"""
            <html>
            <body style="font-family: Arial, sans-serif; padding: 20px;">
                <div style="background-color: #1f2937; padding: 20px; border-radius: 8px; color: #e5e7eb;">
                    <h2 style="color: #60a5fa; margin-top: 0;">Situation Room</h2>
                    <pre style="white-space: pre-wrap; font-family: inherit;">{body}</pre>
                </div>
            </body>
            </html>
            """
            html_part = MIMEText(html_body, "html")
            msg.attach(html_part)

            await aiosmtplib.send(
                msg,
                hostname=self.config.smtp.host,
                port=self.config.smtp.port,
                username=self.config.smtp.username or None,
                password=self.config.smtp.password or None,
                use_tls=self.config.smtp.use_tls,
            )

            logger.info(f"Email notification sent to {to_email}")
            return True
        except Exception as e:
            logger.error(f"Failed to send email notification: {e}")
            return False


# Background task for checking due dates
async def check_due_dates_task(notification_service: NotificationService, db_session):
    """Background task to check for approaching due dates."""
    from ..services.task import TaskService

    while True:
        try:
            task_service = TaskService(db_session)
            due_soon = await task_service.get_tasks_due_soon(days=1)

            for task in due_soon:
                # Get assignee email if available
                config = get_config()
                assignee_email = None
                for user in config.users:
                    if user.username == task.assignee:
                        assignee_email = user.email
                        break

                await notification_service.notify_due_date_approaching(
                    task, assignee_email
                )

        except Exception as e:
            logger.error(f"Error in due date check task: {e}")

        # Run every hour
        await asyncio.sleep(3600)
