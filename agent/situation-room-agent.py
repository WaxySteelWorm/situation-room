#!/usr/bin/env python3
"""
Situation Room Monitoring Agent

A lightweight agent that collects UFW logs and health check data,
then pushes them to the Situation Room server via WebSocket.

Supports automatic self-updates when new versions are available.

Requirements:
    pip install websockets pyyaml

Usage:
    python situation-room-agent.py --config /path/to/agent-config.yml
"""

__version__ = "1.0.0"

import argparse
import asyncio
import hashlib
import json
import logging
import os
import platform
import random
import re
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

try:
    import websockets
    import yaml
except ImportError:
    print("Missing required packages. Install with: pip install websockets pyyaml")
    sys.exit(1)


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('situation-room-agent')


class Config:
    """Agent configuration."""

    def __init__(self, config_path: str):
        self.config_path = config_path
        self.load()

    def load(self):
        """Load configuration from YAML file."""
        if not Path(self.config_path).exists():
            raise FileNotFoundError(f"Config file not found: {self.config_path}")

        with open(self.config_path, 'r') as f:
            config = yaml.safe_load(f)

        # Server settings
        server = config.get('server', {})
        self.server_url = server.get('url', 'wss://localhost/api/monitoring/ws/agent')
        self.api_key = server.get('api_key', '')
        self.verify_ssl = server.get('verify_ssl', True)

        # Agent settings
        agent = config.get('agent', {})
        self.hostname = agent.get('hostname', socket.gethostname())
        self.report_interval = agent.get('report_interval_seconds', 60)

        # UFW log settings
        ufw = config.get('ufw', {})
        self.ufw_enabled = ufw.get('enabled', True)
        self.ufw_log_path = ufw.get('log_path', '/var/log/ufw.log')

        # Health check settings
        health = config.get('health_checks', {})
        self.health_checks_enabled = health.get('enabled', True)
        self.health_checks = health.get('checks', [
            {'name': 'disk', 'type': 'disk', 'path': '/'},
            {'name': 'memory', 'type': 'memory'},
            {'name': 'internet', 'type': 'connectivity', 'host': '8.8.8.8', 'port': 53},
        ])

        # Auto-update settings
        auto_update = config.get('auto_update', {})
        self.auto_update_enabled = auto_update.get('enabled', True)
        self.version_url = auto_update.get('version_url', 'https://vault.stormycloud.org/agent/version')
        self.install_dir = auto_update.get('install_dir', '/opt/situation-room-agent')
        self.venv_path = auto_update.get('venv_path', '/opt/situation-room-agent/venv')
        self.service_name = auto_update.get('service_name', 'situation-room-agent')

        if not self.api_key:
            raise ValueError("API key is required in configuration")


class UFWLogReader:
    """Reads and parses UFW log entries."""

    def __init__(self, log_path: str):
        self.log_path = log_path
        self.last_position = 0
        self._inode = None

    def _get_inode(self) -> Optional[int]:
        """Get the inode of the log file."""
        try:
            return os.stat(self.log_path).st_ino
        except FileNotFoundError:
            return None

    def read_new_entries(self) -> list[str]:
        """Read new log entries since last read."""
        entries = []

        try:
            current_inode = self._get_inode()

            # Check if file was rotated
            if self._inode is not None and current_inode != self._inode:
                logger.info("Log file rotated, resetting position")
                self.last_position = 0

            self._inode = current_inode

            with open(self.log_path, 'r') as f:
                f.seek(self.last_position)
                for line in f:
                    if '[UFW BLOCK]' in line:
                        entries.append(line.strip())
                self.last_position = f.tell()

        except FileNotFoundError:
            logger.warning(f"UFW log file not found: {self.log_path}")
        except PermissionError:
            logger.error(f"Permission denied reading: {self.log_path}")
        except Exception as e:
            logger.error(f"Error reading UFW log: {e}")

        return entries


class HealthChecker:
    """Runs various health checks."""

    @staticmethod
    async def check_connectivity(host: str, port: int, timeout: float = 5.0) -> dict:
        """Check network connectivity to a host."""
        start = time.time()
        try:
            _, writer = await asyncio.wait_for(
                asyncio.open_connection(host, port),
                timeout=timeout
            )
            writer.close()
            await writer.wait_closed()
            latency = (time.time() - start) * 1000
            return {
                'healthy': True,
                'latency_ms': latency,
                'message': f'Connected to {host}:{port}'
            }
        except asyncio.TimeoutError:
            return {
                'healthy': False,
                'latency_ms': None,
                'message': f'Timeout connecting to {host}:{port}'
            }
        except Exception as e:
            return {
                'healthy': False,
                'latency_ms': None,
                'message': f'Failed to connect: {str(e)}'
            }

    @staticmethod
    def check_disk(path: str = '/') -> dict:
        """Check disk usage."""
        try:
            stat = os.statvfs(path)
            total = stat.f_blocks * stat.f_frsize
            free = stat.f_bavail * stat.f_frsize
            used_percent = ((total - free) / total) * 100

            return {
                'healthy': used_percent < 90,
                'latency_ms': None,
                'message': f'{used_percent:.1f}% used',
                'details': {
                    'total_bytes': total,
                    'free_bytes': free,
                    'used_percent': used_percent
                }
            }
        except Exception as e:
            return {
                'healthy': False,
                'latency_ms': None,
                'message': f'Failed to check disk: {str(e)}'
            }

    @staticmethod
    def check_memory() -> dict:
        """Check memory usage."""
        try:
            with open('/proc/meminfo', 'r') as f:
                meminfo = {}
                for line in f:
                    parts = line.split(':')
                    if len(parts) == 2:
                        key = parts[0].strip()
                        value = int(parts[1].strip().split()[0]) * 1024  # Convert to bytes
                        meminfo[key] = value

            total = meminfo.get('MemTotal', 0)
            available = meminfo.get('MemAvailable', meminfo.get('MemFree', 0))
            used_percent = ((total - available) / total) * 100 if total > 0 else 0

            return {
                'healthy': used_percent < 95,
                'latency_ms': None,
                'message': f'{used_percent:.1f}% used',
                'details': {
                    'total_bytes': total,
                    'available_bytes': available,
                    'used_percent': used_percent
                }
            }
        except Exception as e:
            return {
                'healthy': False,
                'latency_ms': None,
                'message': f'Failed to check memory: {str(e)}'
            }

    @staticmethod
    def check_load() -> dict:
        """Check system load."""
        try:
            load1, load5, load15 = os.getloadavg()
            cpu_count = os.cpu_count() or 1
            high_load = load1 > (cpu_count * 2)

            return {
                'healthy': not high_load,
                'latency_ms': None,
                'message': f'Load: {load1:.2f}, {load5:.2f}, {load15:.2f}',
                'details': {
                    'load_1m': load1,
                    'load_5m': load5,
                    'load_15m': load15,
                    'cpu_count': cpu_count
                }
            }
        except Exception as e:
            return {
                'healthy': False,
                'latency_ms': None,
                'message': f'Failed to check load: {str(e)}'
            }

    @staticmethod
    async def run_custom_command(command: str, timeout: float = 30.0) -> dict:
        """Run a custom command for health check."""
        try:
            start = time.time()
            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(),
                timeout=timeout
            )
            latency = (time.time() - start) * 1000

            return {
                'healthy': proc.returncode == 0,
                'latency_ms': latency,
                'message': stdout.decode().strip() if proc.returncode == 0 else stderr.decode().strip(),
                'details': {'exit_code': proc.returncode}
            }
        except asyncio.TimeoutError:
            return {
                'healthy': False,
                'latency_ms': None,
                'message': 'Command timed out'
            }
        except Exception as e:
            return {
                'healthy': False,
                'latency_ms': None,
                'message': f'Command failed: {str(e)}'
            }

    async def run_check(self, check_config: dict) -> dict:
        """Run a single health check based on configuration."""
        check_type = check_config.get('type', 'custom')
        name = check_config.get('name', check_type)

        if check_type == 'connectivity':
            result = await self.check_connectivity(
                check_config.get('host', '8.8.8.8'),
                check_config.get('port', 53),
                check_config.get('timeout', 5.0)
            )
        elif check_type == 'disk':
            result = self.check_disk(check_config.get('path', '/'))
        elif check_type == 'memory':
            result = self.check_memory()
        elif check_type == 'load':
            result = self.check_load()
        elif check_type == 'custom':
            command = check_config.get('command', 'true')
            result = await self.run_custom_command(command, check_config.get('timeout', 30.0))
        else:
            result = {
                'healthy': False,
                'latency_ms': None,
                'message': f'Unknown check type: {check_type}'
            }

        result['name'] = name
        result['type'] = check_type
        return result


class AutoUpdater:
    """Handles automatic agent updates."""

    def __init__(self, config: Config):
        self.config = config
        self.current_version = __version__
        self._update_check_time: Optional[datetime] = None
        self._next_check: Optional[datetime] = None
        self._update_in_progress = False
        self._schedule_next_check()

    def _schedule_next_check(self):
        """Schedule the next update check at a random time within 24 hours."""
        # Pick a random time within the next 24 hours
        random_hours = random.uniform(0.5, 24.0)  # Between 30 min and 24 hours
        self._next_check = datetime.now() + timedelta(hours=random_hours)
        logger.info(f"Next update check scheduled for: {self._next_check.strftime('%Y-%m-%d %H:%M:%S')}")

    def should_check_update(self) -> bool:
        """Check if it's time to check for updates."""
        if not self.config.auto_update_enabled:
            return False
        if self._update_in_progress:
            return False
        if self._next_check is None:
            self._schedule_next_check()
            return False
        return datetime.now() >= self._next_check

    async def check_for_update(self) -> Optional[dict]:
        """Check the version endpoint for available updates."""
        import ssl
        import urllib.request
        import urllib.error

        try:
            logger.info(f"Checking for updates at {self.config.version_url}")

            # Create SSL context
            ssl_context = ssl.create_default_context()
            if not self.config.verify_ssl:
                ssl_context.check_hostname = False
                ssl_context.verify_mode = ssl.CERT_NONE

            request = urllib.request.Request(
                self.config.version_url,
                headers={'User-Agent': f'SituationRoomAgent/{self.current_version}'}
            )

            with urllib.request.urlopen(request, timeout=30, context=ssl_context) as response:
                data = json.loads(response.read().decode('utf-8'))

            server_version = data.get('version', '0.0.0')

            # Compare versions
            if self._version_compare(server_version, self.current_version) > 0:
                logger.info(f"Update available: {self.current_version} -> {server_version}")
                return data
            else:
                logger.info(f"Agent is up to date (v{self.current_version})")
                return None

        except urllib.error.URLError as e:
            logger.error(f"Failed to check for updates: {e}")
            return None
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON from version endpoint: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error checking for updates: {e}")
            return None
        finally:
            # Schedule next check regardless of result
            self._schedule_next_check()

    def _version_compare(self, v1: str, v2: str) -> int:
        """Compare two semantic version strings. Returns >0 if v1 > v2."""
        def parse_version(v: str) -> tuple:
            # Handle versions like "1.0.0" or "v1.0.0"
            v = v.lstrip('v')
            parts = []
            for part in v.split('.'):
                try:
                    parts.append(int(part))
                except ValueError:
                    parts.append(0)
            # Pad to 3 parts
            while len(parts) < 3:
                parts.append(0)
            return tuple(parts[:3])

        v1_parts = parse_version(v1)
        v2_parts = parse_version(v2)

        for a, b in zip(v1_parts, v2_parts):
            if a > b:
                return 1
            elif a < b:
                return -1
        return 0

    async def perform_update(self, update_info: dict) -> dict:
        """
        Download and install the update.

        Returns a dict with update result for reporting to server.
        """
        import ssl
        import urllib.request
        import urllib.error

        self._update_in_progress = True
        started_at = datetime.now()
        from_version = self.current_version
        to_version = update_info.get('version', 'unknown')

        result = {
            'success': False,
            'from_version': from_version,
            'to_version': to_version,
            'started_at': started_at.isoformat(),
            'error': None
        }

        try:
            download_url = update_info.get('url')
            expected_sha256 = update_info.get('sha256')
            dependencies = update_info.get('dependencies', [])

            if not download_url or not expected_sha256:
                raise ValueError("Missing download URL or SHA256 in update info")

            # Create SSL context
            ssl_context = ssl.create_default_context()
            if not self.config.verify_ssl:
                ssl_context.check_hostname = False
                ssl_context.verify_mode = ssl.CERT_NONE

            # Download to temp location
            logger.info(f"Downloading new agent from {download_url}")
            with tempfile.NamedTemporaryFile(mode='wb', suffix='.py', delete=False) as tmp_file:
                tmp_path = tmp_file.name

                request = urllib.request.Request(
                    download_url,
                    headers={'User-Agent': f'SituationRoomAgent/{self.current_version}'}
                )

                with urllib.request.urlopen(request, timeout=60, context=ssl_context) as response:
                    content = response.read()
                    tmp_file.write(content)

            # Verify SHA256 checksum
            logger.info("Verifying checksum...")
            actual_sha256 = hashlib.sha256(content).hexdigest()
            if actual_sha256.lower() != expected_sha256.lower():
                os.unlink(tmp_path)
                raise ValueError(f"Checksum mismatch: expected {expected_sha256}, got {actual_sha256}")

            logger.info("Checksum verified successfully")

            # Install/update dependencies if needed
            if dependencies:
                await self._update_dependencies(dependencies)

            # Replace the agent script
            agent_script_path = Path(self.config.install_dir) / 'situation-room-agent.py'
            logger.info(f"Replacing agent script at {agent_script_path}")

            # Backup old script
            backup_path = agent_script_path.with_suffix('.py.bak')
            if agent_script_path.exists():
                shutil.copy2(agent_script_path, backup_path)
                logger.info(f"Backed up old script to {backup_path}")

            # Move new script into place
            shutil.move(tmp_path, agent_script_path)
            os.chmod(agent_script_path, 0o755)

            result['success'] = True
            result['completed_at'] = datetime.now().isoformat()
            logger.info(f"Update completed successfully: {from_version} -> {to_version}")

            # Schedule restart
            logger.info("Scheduling service restart...")
            await self._schedule_restart()

        except Exception as e:
            error_msg = str(e)
            result['error'] = error_msg
            result['completed_at'] = datetime.now().isoformat()
            logger.error(f"Update failed: {error_msg}")

            # Clean up temp file if it exists
            if 'tmp_path' in locals() and os.path.exists(tmp_path):
                os.unlink(tmp_path)

        finally:
            self._update_in_progress = False

        return result

    async def _update_dependencies(self, dependencies: list):
        """Install or update dependencies using pip in the venv."""
        logger.info(f"Updating dependencies: {dependencies}")

        pip_path = Path(self.config.venv_path) / 'bin' / 'pip'
        if not pip_path.exists():
            pip_path = Path(self.config.venv_path) / 'bin' / 'pip3'

        if not pip_path.exists():
            logger.warning(f"pip not found at {pip_path}, skipping dependency update")
            return

        for dep in dependencies:
            try:
                proc = await asyncio.create_subprocess_exec(
                    str(pip_path), 'install', '--quiet', '--upgrade', dep,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)

                if proc.returncode == 0:
                    logger.info(f"Updated dependency: {dep}")
                else:
                    logger.warning(f"Failed to update {dep}: {stderr.decode()}")

            except asyncio.TimeoutError:
                logger.warning(f"Timeout updating dependency: {dep}")
            except Exception as e:
                logger.warning(f"Error updating dependency {dep}: {e}")

    async def _schedule_restart(self):
        """Schedule a service restart using systemctl."""
        try:
            # Use a small delay to allow the update result to be sent
            await asyncio.sleep(2)

            logger.info(f"Restarting service: {self.config.service_name}")

            # Use subprocess to restart (this will terminate the current process)
            proc = await asyncio.create_subprocess_exec(
                'systemctl', 'restart', self.config.service_name,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)

            if proc.returncode != 0:
                logger.error(f"Failed to restart service: {stderr.decode()}")
            else:
                logger.info("Service restart initiated")

        except Exception as e:
            logger.error(f"Error scheduling restart: {e}")


class Agent:
    """Main monitoring agent."""

    VERSION = __version__

    def __init__(self, config: Config):
        self.config = config
        self.ufw_reader = UFWLogReader(config.ufw_log_path) if config.ufw_enabled else None
        self.health_checker = HealthChecker()
        self.auto_updater = AutoUpdater(config) if config.auto_update_enabled else None
        self.running = True
        self.websocket = None
        self._reconnect_delay = 5

    def get_os_info(self) -> str:
        """Get OS information."""
        return f"{platform.system()} {platform.release()}"

    async def connect(self):
        """Connect to the Situation Room server."""
        import ssl

        ssl_context = None
        if self.config.server_url.startswith('wss://'):
            ssl_context = ssl.create_default_context()
            if not self.config.verify_ssl:
                ssl_context.check_hostname = False
                ssl_context.verify_mode = ssl.CERT_NONE

        while self.running:
            try:
                logger.info(f"Connecting to {self.config.server_url}")

                async with websockets.connect(
                    self.config.server_url,
                    ssl=ssl_context,
                    ping_interval=30,
                    ping_timeout=10,
                ) as websocket:
                    self.websocket = websocket
                    self._reconnect_delay = 5  # Reset on successful connection

                    # Send authentication
                    await websocket.send(json.dumps({
                        'type': 'auth',
                        'hostname': self.config.hostname,
                        'api_key': self.config.api_key,
                        'version': self.VERSION,
                        'os_info': self.get_os_info()
                    }))

                    # Wait for auth response
                    response = await asyncio.wait_for(
                        websocket.recv(),
                        timeout=10.0
                    )
                    data = json.loads(response)

                    if data.get('type') != 'auth_success':
                        logger.error(f"Authentication failed: {data.get('message', 'Unknown error')}")
                        return

                    logger.info(f"Connected and authenticated: {data.get('message')}")

                    # Main loop
                    await self.run_loop(websocket)

            except websockets.exceptions.ConnectionClosed as e:
                logger.warning(f"Connection closed: {e}")
            except Exception as e:
                logger.error(f"Connection error: {e}")

            if self.running:
                logger.info(f"Reconnecting in {self._reconnect_delay} seconds...")
                await asyncio.sleep(self._reconnect_delay)
                self._reconnect_delay = min(self._reconnect_delay * 2, 60)  # Exponential backoff

    async def run_loop(self, websocket):
        """Main agent loop."""
        last_report = 0

        while self.running:
            try:
                current_time = time.time()

                if current_time - last_report >= self.config.report_interval:
                    await self.send_report(websocket)
                    last_report = current_time

                # Check for auto-updates
                if self.auto_updater and self.auto_updater.should_check_update():
                    await self._handle_auto_update(websocket)

                # Handle incoming messages (non-blocking)
                try:
                    message = await asyncio.wait_for(
                        websocket.recv(),
                        timeout=1.0
                    )
                    data = json.loads(message)

                    if data.get('type') == 'ping':
                        await websocket.send(json.dumps({'type': 'pong'}))

                except asyncio.TimeoutError:
                    pass  # Normal timeout, continue loop

            except websockets.exceptions.ConnectionClosed:
                raise  # Re-raise to trigger reconnection
            except Exception as e:
                logger.error(f"Error in main loop: {e}")
                await asyncio.sleep(1)

    async def _handle_auto_update(self, websocket):
        """Check for and perform auto-updates."""
        try:
            update_info = await self.auto_updater.check_for_update()

            if update_info:
                logger.info("Starting auto-update process...")

                # Perform the update
                result = await self.auto_updater.perform_update(update_info)

                # Report result to server
                try:
                    await websocket.send(json.dumps({
                        'type': 'update_result',
                        **result
                    }))
                    logger.info("Update result sent to server")
                except Exception as e:
                    logger.error(f"Failed to send update result: {e}")

        except Exception as e:
            logger.error(f"Error in auto-update handler: {e}")

    async def send_report(self, websocket):
        """Send UFW logs and health check data."""
        # Collect UFW logs
        if self.ufw_reader:
            logs = self.ufw_reader.read_new_entries()
            if logs:
                await websocket.send(json.dumps({
                    'type': 'ufw_logs',
                    'logs': logs
                }))
                logger.info(f"Sent {len(logs)} UFW log entries")

        # Run health checks
        if self.config.health_checks_enabled:
            checks = []
            for check_config in self.config.health_checks:
                result = await self.health_checker.run_check(check_config)
                checks.append(result)

            await websocket.send(json.dumps({
                'type': 'health_check',
                'checks': checks
            }))
            logger.debug(f"Sent {len(checks)} health check results")

    def stop(self):
        """Stop the agent."""
        logger.info("Stopping agent...")
        self.running = False


async def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description='Situation Room Monitoring Agent')
    parser.add_argument(
        '--config', '-c',
        default='/etc/situation-room/agent.yml',
        help='Path to configuration file'
    )
    parser.add_argument(
        '--debug', '-d',
        action='store_true',
        help='Enable debug logging'
    )
    args = parser.parse_args()

    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)

    try:
        config = Config(args.config)
    except Exception as e:
        logger.error(f"Failed to load configuration: {e}")
        sys.exit(1)

    agent = Agent(config)

    # Handle signals
    loop = asyncio.get_event_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, agent.stop)

    logger.info(f"Starting Situation Room Agent v{Agent.VERSION}")
    logger.info(f"Hostname: {config.hostname}")
    logger.info(f"Server: {config.server_url}")
    logger.info(f"Report interval: {config.report_interval}s")
    logger.info(f"Auto-update: {'enabled' if config.auto_update_enabled else 'disabled'}")

    await agent.connect()


if __name__ == '__main__':
    asyncio.run(main())
