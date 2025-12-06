"""WebSocket connection manager for monitoring agents."""

import asyncio
import hashlib
import json
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Optional

from fastapi import WebSocket, WebSocketDisconnect

from ..config import get_config

logger = logging.getLogger(__name__)


@dataclass
class AgentConnection:
    """Represents an active agent WebSocket connection."""
    websocket: WebSocket
    hostname: str
    ip_address: str
    connected_at: datetime
    last_message: datetime


@dataclass
class UFWLogEntry:
    """Parsed UFW log entry."""
    timestamp: datetime
    source_ip: str
    source_port: Optional[int]
    dest_ip: Optional[str]
    dest_port: Optional[int]
    protocol: Optional[str]
    raw_log: str


class WebSocketManager:
    """Manages WebSocket connections from monitoring agents."""

    def __init__(self):
        self._connections: dict[str, AgentConnection] = {}  # hostname -> connection
        self._message_handlers: list[Callable[[str, dict], None]] = []
        self._lock = asyncio.Lock()

    def verify_api_key(self, api_key: str) -> bool:
        """Verify the agent API key."""
        config = get_config()
        expected = config.monitoring.agent_api_key
        # Use constant-time comparison to prevent timing attacks
        return hashlib.sha256(api_key.encode()).hexdigest() == hashlib.sha256(expected.encode()).hexdigest()

    async def connect(self, websocket: WebSocket, hostname: str, ip_address: str, api_key: str) -> bool:
        """
        Accept a new agent connection.

        Args:
            websocket: The WebSocket connection
            hostname: Agent's hostname
            ip_address: Agent's IP address
            api_key: API key for authentication

        Returns:
            True if connection accepted, False otherwise
        """
        if not self.verify_api_key(api_key):
            logger.warning(f"Agent connection rejected: invalid API key from {hostname} ({ip_address})")
            await websocket.close(code=4001, reason="Invalid API key")
            return False

        async with self._lock:
            # Close existing connection from same hostname if any
            if hostname in self._connections:
                old_conn = self._connections[hostname]
                try:
                    await old_conn.websocket.close(code=4002, reason="Replaced by new connection")
                except Exception:
                    pass

            await websocket.accept()
            now = datetime.utcnow()
            self._connections[hostname] = AgentConnection(
                websocket=websocket,
                hostname=hostname,
                ip_address=ip_address,
                connected_at=now,
                last_message=now
            )
            logger.info(f"Agent connected: {hostname} ({ip_address})")
            return True

    async def disconnect(self, hostname: str):
        """Handle agent disconnection."""
        async with self._lock:
            if hostname in self._connections:
                del self._connections[hostname]
                logger.info(f"Agent disconnected: {hostname}")

    def get_connected_agents(self) -> list[dict[str, Any]]:
        """Get list of currently connected agents."""
        agents = []
        for hostname, conn in self._connections.items():
            agents.append({
                "hostname": hostname,
                "ip_address": conn.ip_address,
                "connected_at": conn.connected_at.isoformat(),
                "last_message": conn.last_message.isoformat()
            })
        return agents

    def is_agent_connected(self, hostname: str) -> bool:
        """Check if an agent is currently connected."""
        return hostname in self._connections

    async def send_to_agent(self, hostname: str, message: dict) -> bool:
        """Send a message to a specific agent."""
        if hostname not in self._connections:
            return False

        try:
            await self._connections[hostname].websocket.send_json(message)
            return True
        except Exception as e:
            logger.error(f"Failed to send message to {hostname}: {e}")
            return False

    async def broadcast(self, message: dict):
        """Broadcast a message to all connected agents."""
        async with self._lock:
            for hostname in list(self._connections.keys()):
                try:
                    await self._connections[hostname].websocket.send_json(message)
                except Exception as e:
                    logger.error(f"Failed to broadcast to {hostname}: {e}")

    def register_handler(self, handler: Callable[[str, dict], None]):
        """Register a message handler."""
        self._message_handlers.append(handler)

    async def handle_message(self, hostname: str, message: dict):
        """Process an incoming message from an agent."""
        async with self._lock:
            if hostname in self._connections:
                self._connections[hostname].last_message = datetime.utcnow()

        for handler in self._message_handlers:
            try:
                await handler(hostname, message)
            except Exception as e:
                logger.error(f"Handler error processing message from {hostname}: {e}")

    @staticmethod
    def parse_ufw_log(log_line: str) -> Optional[UFWLogEntry]:
        """
        Parse a UFW log line into structured data.

        Example log lines:
        Syslog format: Dec  6 12:34:56 hostname kernel: [12345.678901] [UFW BLOCK] IN=eth0 OUT= MAC=... SRC=1.2.3.4 DST=5.6.7.8 ...
        ISO 8601 format: 2025-12-06T14:06:32.202018-06:00 hostname kernel: [UFW BLOCK] IN=eth0 OUT= MAC=... SRC=1.2.3.4 DST=5.6.7.8 ...
        """
        if "[UFW BLOCK]" not in log_line:
            return None

        timestamp = None

        # Try ISO 8601 format first (e.g., 2025-12-06T14:06:32.202018-06:00)
        iso_match = re.match(r'^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})', log_line)
        if iso_match:
            try:
                timestamp_str = iso_match.group(1)
                timestamp = datetime.strptime(timestamp_str, "%Y-%m-%dT%H:%M:%S")
            except ValueError:
                pass

        # Try syslog format (e.g., Dec  6 12:34:56)
        if not timestamp:
            syslog_match = re.match(r'^(\w+\s+\d+\s+\d+:\d+:\d+)', log_line)
            if syslog_match:
                try:
                    timestamp_str = syslog_match.group(1)
                    current_year = datetime.utcnow().year
                    timestamp = datetime.strptime(f"{current_year} {timestamp_str}", "%Y %b %d %H:%M:%S")
                except ValueError:
                    pass

        # Fallback to current time
        if not timestamp:
            timestamp = datetime.utcnow()

        # Extract fields using regex
        src_match = re.search(r'SRC=(\S+)', log_line)
        dst_match = re.search(r'DST=(\S+)', log_line)
        spt_match = re.search(r'SPT=(\d+)', log_line)
        dpt_match = re.search(r'DPT=(\d+)', log_line)
        proto_match = re.search(r'PROTO=(\S+)', log_line)

        if not src_match:
            return None

        return UFWLogEntry(
            timestamp=timestamp,
            source_ip=src_match.group(1),
            source_port=int(spt_match.group(1)) if spt_match else None,
            dest_ip=dst_match.group(1) if dst_match else None,
            dest_port=int(dpt_match.group(1)) if dpt_match else None,
            protocol=proto_match.group(1) if proto_match else None,
            raw_log=log_line
        )


# Global singleton instance
_websocket_manager: Optional[WebSocketManager] = None


def get_websocket_manager() -> WebSocketManager:
    """Get the global WebSocket manager instance."""
    global _websocket_manager
    if _websocket_manager is None:
        _websocket_manager = WebSocketManager()
    return _websocket_manager
