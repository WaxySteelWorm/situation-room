"""Observium service for traffic monitoring."""

import json
import logging
from datetime import datetime, timedelta
from typing import Optional

import httpx
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_config
from ..models.network import TrafficSample, DailyTrafficSummary, ObserviumAlert

logger = logging.getLogger(__name__)


class ObserviumService:
    """Service for interacting with Observium API."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.config = get_config()
        self.observium_config = self.config.network.observium

    def _get_auth(self) -> tuple[str, str]:
        """Get basic auth credentials."""
        return (self.observium_config.username, self.observium_config.password)

    async def is_available(self) -> bool:
        """Check if Observium API is available and configured."""
        if not self.observium_config.enabled or not self.observium_config.url:
            return False

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.observium_config.url}/devices",
                    auth=self._get_auth(),
                    timeout=10.0,
                )
                return response.status_code == 200
        except Exception as e:
            logger.error(f"Observium API check failed: {e}")
            return False

    async def fetch_devices(self) -> dict:
        """Fetch all devices from Observium."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.observium_config.url}/devices",
                    auth=self._get_auth(),
                    timeout=30.0,
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"Failed to fetch devices: {e}")
            return {"error": str(e)}

    async def fetch_ports(self, device_id: Optional[int] = None) -> dict:
        """Fetch port/interface information."""
        try:
            url = f"{self.observium_config.url}/ports"
            if device_id:
                url = f"{self.observium_config.url}/devices/{device_id}/ports"

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    url,
                    auth=self._get_auth(),
                    timeout=30.0,
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"Failed to fetch ports: {e}")
            return {"error": str(e)}

    async def fetch_port_by_name(self, interface_name: str) -> Optional[dict]:
        """Fetch a specific port by interface name."""
        try:
            ports_data = await self.fetch_ports()
            if "error" in ports_data:
                return None

            ports = ports_data.get("ports", ports_data.get("data", []))
            if isinstance(ports, dict):
                ports = list(ports.values())

            for port in ports:
                # Match by ifName or ifDescr
                if port.get("ifName") == interface_name or port.get("ifDescr") == interface_name:
                    return port

            return None
        except Exception as e:
            logger.error(f"Failed to find port {interface_name}: {e}")
            return None

    async def fetch_port_traffic(self, port_id: int) -> dict:
        """Fetch current traffic stats for a port."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.observium_config.url}/ports/{port_id}",
                    auth=self._get_auth(),
                    timeout=30.0,
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"Failed to fetch port traffic: {e}")
            return {"error": str(e)}

    async def fetch_port_graphs(
        self,
        port_id: int,
        period: str = "day",  # day, week, month, year
    ) -> dict:
        """Fetch traffic graph data for a port."""
        try:
            async with httpx.AsyncClient() as client:
                # Observium graph endpoint
                response = await client.get(
                    f"{self.observium_config.url}/ports/{port_id}/graphs",
                    auth=self._get_auth(),
                    timeout=30.0,
                    params={"type": "port_bits", "period": period}
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"Failed to fetch port graphs: {e}")
            return {"error": str(e)}

    async def fetch_bills(self) -> dict:
        """Fetch billing/traffic accounting data."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.observium_config.url}/bills",
                    auth=self._get_auth(),
                    timeout=30.0,
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"Failed to fetch bills: {e}")
            return {"error": str(e)}

    async def fetch_alerts(self, status: str = "all") -> dict:
        """Fetch alerts from Observium."""
        try:
            params = {}
            if status != "all":
                params["status"] = status

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.observium_config.url}/alerts",
                    auth=self._get_auth(),
                    timeout=30.0,
                    params=params,
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"Failed to fetch alerts: {e}")
            return {"error": str(e)}

    async def record_traffic_sample(
        self,
        interface_name: str,
        traffic_in: int,
        traffic_out: int,
        interface_speed: Optional[int] = None,
        device_hostname: Optional[str] = None,
    ) -> TrafficSample:
        """Record a traffic sample to the database."""
        utilization_in = None
        utilization_out = None

        if interface_speed and interface_speed > 0:
            utilization_in = (traffic_in / interface_speed) * 100
            utilization_out = (traffic_out / interface_speed) * 100

        sample = TrafficSample(
            interface_name=interface_name,
            device_hostname=device_hostname,
            traffic_in=traffic_in,
            traffic_out=traffic_out,
            interface_speed=interface_speed,
            utilization_in=utilization_in,
            utilization_out=utilization_out,
            sample_time=datetime.utcnow(),
        )

        self.db.add(sample)
        await self.db.commit()
        await self.db.refresh(sample)

        return sample

    async def update_daily_summary(
        self,
        interface_name: str,
        device_hostname: Optional[str] = None,
    ) -> Optional[DailyTrafficSummary]:
        """Update the daily traffic summary for an interface."""
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        tomorrow = today + timedelta(days=1)

        # Get today's samples
        result = await self.db.execute(
            select(TrafficSample)
            .where(
                TrafficSample.interface_name == interface_name,
                TrafficSample.sample_time >= today,
                TrafficSample.sample_time < tomorrow,
            )
        )
        samples = list(result.scalars().all())

        if not samples:
            return None

        # Calculate statistics
        total_in = sum(s.traffic_in for s in samples)
        total_out = sum(s.traffic_out for s in samples)
        peak_in = max(s.traffic_in for s in samples)
        peak_out = max(s.traffic_out for s in samples)
        avg_in = total_in // len(samples) if samples else 0
        avg_out = total_out // len(samples) if samples else 0

        # Check if summary exists
        result = await self.db.execute(
            select(DailyTrafficSummary)
            .where(
                DailyTrafficSummary.interface_name == interface_name,
                DailyTrafficSummary.date == today,
            )
        )
        summary = result.scalar_one_or_none()

        if summary:
            summary.total_in_bytes = total_in
            summary.total_out_bytes = total_out
            summary.peak_in = peak_in
            summary.peak_out = peak_out
            summary.avg_in = avg_in
            summary.avg_out = avg_out
            summary.sample_count = len(samples)
        else:
            summary = DailyTrafficSummary(
                interface_name=interface_name,
                device_hostname=device_hostname,
                date=today,
                total_in_bytes=total_in,
                total_out_bytes=total_out,
                peak_in=peak_in,
                peak_out=peak_out,
                avg_in=avg_in,
                avg_out=avg_out,
                sample_count=len(samples),
            )
            self.db.add(summary)

        await self.db.commit()
        await self.db.refresh(summary)
        return summary

    async def record_observium_alert(
        self,
        alert_status: str,
        observium_alert_id: Optional[int] = None,
        device_hostname: Optional[str] = None,
        entity_type: Optional[str] = None,
        entity_name: Optional[str] = None,
        severity: Optional[str] = None,
        message: Optional[str] = None,
        raw_data: Optional[dict] = None,
        alert_time: Optional[datetime] = None,
    ) -> ObserviumAlert:
        """Record an Observium alert to the database."""
        alert = ObserviumAlert(
            observium_alert_id=observium_alert_id,
            device_hostname=device_hostname,
            entity_type=entity_type,
            entity_name=entity_name,
            alert_status=alert_status,
            severity=severity,
            message=message,
            raw_data=json.dumps(raw_data) if raw_data else None,
            alert_time=alert_time or datetime.utcnow(),
        )

        self.db.add(alert)
        await self.db.commit()
        await self.db.refresh(alert)

        return alert

    async def get_recent_traffic(
        self,
        interface_name: str,
        minutes: int = 60,
    ) -> list[TrafficSample]:
        """Get recent traffic samples for an interface."""
        cutoff = datetime.utcnow() - timedelta(minutes=minutes)

        result = await self.db.execute(
            select(TrafficSample)
            .where(
                TrafficSample.interface_name == interface_name,
                TrafficSample.sample_time >= cutoff,
            )
            .order_by(TrafficSample.sample_time)
        )
        return list(result.scalars().all())

    async def get_daily_summaries(
        self,
        interface_name: str,
        days: int = 30,
    ) -> list[DailyTrafficSummary]:
        """Get daily traffic summaries for an interface."""
        cutoff = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days)

        result = await self.db.execute(
            select(DailyTrafficSummary)
            .where(
                DailyTrafficSummary.interface_name == interface_name,
                DailyTrafficSummary.date >= cutoff,
            )
            .order_by(DailyTrafficSummary.date)
        )
        return list(result.scalars().all())

    async def get_recent_alerts(
        self,
        hours: int = 24,
        status: Optional[str] = None,
    ) -> list[ObserviumAlert]:
        """Get recent Observium alerts."""
        cutoff = datetime.utcnow() - timedelta(hours=hours)

        query = select(ObserviumAlert).where(ObserviumAlert.alert_time >= cutoff)

        if status:
            query = query.where(ObserviumAlert.alert_status == status)

        query = query.order_by(desc(ObserviumAlert.alert_time))

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_current_interface_stats(self) -> list[dict]:
        """Get current stats for all configured interfaces."""
        stats = []

        for interface_name in self.observium_config.interfaces:
            port = await self.fetch_port_by_name(interface_name)
            if port:
                # Get the latest sample from database for comparison
                result = await self.db.execute(
                    select(TrafficSample)
                    .where(TrafficSample.interface_name == interface_name)
                    .order_by(desc(TrafficSample.sample_time))
                    .limit(1)
                )
                last_sample = result.scalar_one_or_none()

                stats.append({
                    "interface_name": interface_name,
                    "port_id": port.get("port_id"),
                    "ifSpeed": port.get("ifSpeed"),
                    "ifOperStatus": port.get("ifOperStatus"),
                    "ifAdminStatus": port.get("ifAdminStatus"),
                    "ifInOctets_rate": port.get("ifInOctets_rate", 0),
                    "ifOutOctets_rate": port.get("ifOutOctets_rate", 0),
                    "ifInOctets_perc": port.get("ifInOctets_perc", 0),
                    "ifOutOctets_perc": port.get("ifOutOctets_perc", 0),
                    "last_sample_time": last_sample.sample_time.isoformat() if last_sample else None,
                    "device_hostname": port.get("hostname"),
                })
            else:
                stats.append({
                    "interface_name": interface_name,
                    "error": "Interface not found in Observium",
                })

        return stats

    async def get_traffic_summary(self) -> dict:
        """Get a summary of current traffic status."""
        interface_stats = await self.get_current_interface_stats()

        # Get today's totals
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

        daily_totals = []
        for interface_name in self.observium_config.interfaces:
            result = await self.db.execute(
                select(DailyTrafficSummary)
                .where(
                    DailyTrafficSummary.interface_name == interface_name,
                    DailyTrafficSummary.date == today,
                )
            )
            summary = result.scalar_one_or_none()
            if summary:
                daily_totals.append({
                    "interface_name": interface_name,
                    "total_in_bytes": summary.total_in_bytes,
                    "total_out_bytes": summary.total_out_bytes,
                    "peak_in": summary.peak_in,
                    "peak_out": summary.peak_out,
                    "sample_count": summary.sample_count,
                })

        # Get alert count
        result = await self.db.execute(
            select(func.count(ObserviumAlert.id))
            .where(ObserviumAlert.alert_status == "active")
        )
        active_alerts = result.scalar() or 0

        return {
            "interfaces": interface_stats,
            "daily_totals": daily_totals,
            "active_alerts": active_alerts,
            "monitoring_interfaces": self.observium_config.interfaces,
        }

    async def poll_and_update(self) -> dict:
        """Poll Observium for updates and store traffic data."""
        results = {
            "samples_recorded": 0,
            "summaries_updated": 0,
            "alerts_recorded": 0,
            "errors": [],
        }

        try:
            # Poll each configured interface
            for interface_name in self.observium_config.interfaces:
                port = await self.fetch_port_by_name(interface_name)
                if port:
                    # Record traffic sample
                    traffic_in = int(port.get("ifInOctets_rate", 0) or 0)
                    traffic_out = int(port.get("ifOutOctets_rate", 0) or 0)
                    interface_speed = int(port.get("ifSpeed", 0) or 0)

                    await self.record_traffic_sample(
                        interface_name=interface_name,
                        traffic_in=traffic_in,
                        traffic_out=traffic_out,
                        interface_speed=interface_speed,
                        device_hostname=port.get("hostname"),
                    )
                    results["samples_recorded"] += 1

                    # Update daily summary
                    await self.update_daily_summary(
                        interface_name=interface_name,
                        device_hostname=port.get("hostname"),
                    )
                    results["summaries_updated"] += 1
                else:
                    results["errors"].append(f"Interface {interface_name} not found")

            # Poll alerts
            alerts_data = await self.fetch_alerts(status="active")
            if "error" not in alerts_data:
                alerts = alerts_data.get("alerts", alerts_data.get("data", []))
                if isinstance(alerts, dict):
                    alerts = list(alerts.values())

                for alert in alerts:
                    # Check if we already have this alert
                    alert_id = alert.get("alert_id")
                    if alert_id:
                        result = await self.db.execute(
                            select(ObserviumAlert)
                            .where(ObserviumAlert.observium_alert_id == alert_id)
                        )
                        existing = result.scalar_one_or_none()
                        if existing:
                            continue  # Skip existing alerts

                    await self.record_observium_alert(
                        alert_status=alert.get("alert_status", "active"),
                        observium_alert_id=alert.get("alert_id"),
                        device_hostname=alert.get("hostname"),
                        entity_type=alert.get("entity_type"),
                        entity_name=alert.get("entity_name"),
                        severity=alert.get("severity"),
                        message=alert.get("alert_message"),
                        raw_data=alert,
                    )
                    results["alerts_recorded"] += 1

        except Exception as e:
            logger.error(f"Error during poll_and_update: {e}")
            results["errors"].append(str(e))

        return results

    async def get_traffic_graph_data(
        self,
        interface_name: str,
        hours: int = 24,
    ) -> list[dict]:
        """Get traffic data formatted for graphing."""
        samples = await self.get_recent_traffic(
            interface_name=interface_name,
            minutes=hours * 60,
        )

        return [
            {
                "timestamp": s.sample_time.isoformat(),
                "traffic_in": s.traffic_in,
                "traffic_out": s.traffic_out,
                "utilization_in": s.utilization_in,
                "utilization_out": s.utilization_out,
            }
            for s in samples
        ]
