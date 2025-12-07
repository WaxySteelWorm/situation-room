"""Notification service for sending alerts via Discord, Email, etc."""

import logging
from datetime import datetime
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


class NotificationService:
    """Service for sending notifications to various channels."""

    def __init__(self):
        self._client: Optional[httpx.AsyncClient] = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=30.0)
        return self._client

    async def send_discord(
        self,
        webhook_url: str,
        title: str,
        message: str,
        severity: str = "info",
        hostname: Optional[str] = None,
        metric_value: Optional[float] = None,
        threshold_value: Optional[float] = None,
        alert_type: Optional[str] = None,
    ) -> bool:
        """
        Send a notification to Discord via webhook.

        Returns True if successful, False otherwise.
        """
        # Color based on severity
        color_map = {
            "info": 0x3498db,      # Blue
            "warning": 0xf39c12,   # Amber
            "critical": 0xe74c3c,  # Red
        }
        color = color_map.get(severity, 0x95a5a6)

        # Build embed
        embed = {
            "title": f"{'🔴' if severity == 'critical' else '🟡' if severity == 'warning' else 'ℹ️'} {title}",
            "description": message,
            "color": color,
            "timestamp": datetime.utcnow().isoformat(),
            "footer": {
                "text": "Situation Room Alerts"
            },
            "fields": []
        }

        if hostname:
            embed["fields"].append({
                "name": "Host",
                "value": hostname,
                "inline": True
            })

        if alert_type:
            embed["fields"].append({
                "name": "Type",
                "value": alert_type.replace("_", " ").title(),
                "inline": True
            })

        if metric_value is not None and threshold_value is not None:
            embed["fields"].append({
                "name": "Value",
                "value": f"{metric_value:.1f} (threshold: {threshold_value:.1f})",
                "inline": True
            })

        payload = {
            "embeds": [embed]
        }

        try:
            client = self._get_client()
            response = await client.post(webhook_url, json=payload)

            if response.status_code == 204:
                logger.info(f"Discord notification sent: {title}")
                return True
            else:
                logger.error(f"Discord webhook failed: {response.status_code} - {response.text}")
                return False

        except Exception as e:
            logger.error(f"Failed to send Discord notification: {e}")
            return False

    async def send_email(
        self,
        recipients: list[str],
        subject: str,
        body: str,
        html_body: Optional[str] = None,
    ) -> bool:
        """
        Send an email notification.

        Returns True if successful, False otherwise.
        """
        # TODO: Implement email sending using SMTP config
        logger.warning("Email notifications not yet implemented")
        return False

    async def close(self):
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None


# Global singleton
_notification_service: Optional[NotificationService] = None


def get_notification_service() -> NotificationService:
    """Get the global notification service instance."""
    global _notification_service
    if _notification_service is None:
        _notification_service = NotificationService()
    return _notification_service
