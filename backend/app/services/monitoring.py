"""Monitoring service for threat tracking and agent management."""

import asyncio
import hashlib
import logging
from datetime import datetime, timedelta
from typing import Any, Optional

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_config
from ..models import Agent, AgentStatus, CountryAggregate, HealthCheck, ThreatEvent
from .geoip import get_geoip_service
from .websocket_manager import UFWLogEntry, get_websocket_manager

logger = logging.getLogger(__name__)


class MonitoringService:
    """Service for monitoring-related business logic."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.geoip = get_geoip_service()
        self.ws_manager = get_websocket_manager()

    # ==================== Agent Management ====================

    async def register_agent(
        self,
        hostname: str,
        ip_address: str,
        api_key: str,
        version: Optional[str] = None,
        os_info: Optional[str] = None
    ) -> Optional[Agent]:
        """Register or update an agent."""
        config = get_config()

        # Verify API key
        expected_key = config.monitoring.agent_api_key
        if api_key != expected_key:
            return None

        # Hash the API key for storage
        api_key_hash = hashlib.sha256(api_key.encode()).hexdigest()

        # Check if agent exists
        result = await self.db.execute(
            select(Agent).where(Agent.hostname == hostname)
        )
        agent = result.scalar_one_or_none()

        now = datetime.utcnow()

        if agent:
            # Update existing agent
            agent.ip_address = ip_address
            agent.version = version
            agent.os_info = os_info
            agent.status = AgentStatus.ONLINE.value
            agent.last_seen = now
            agent.updated_at = now
        else:
            # Create new agent
            agent = Agent(
                hostname=hostname,
                ip_address=ip_address,
                api_key_hash=api_key_hash,
                version=version,
                os_info=os_info,
                status=AgentStatus.ONLINE.value,
                last_seen=now,
                is_active=True
            )
            self.db.add(agent)

        await self.db.commit()
        await self.db.refresh(agent)
        return agent

    async def update_agent_status(self, hostname: str) -> None:
        """Update agent last_seen timestamp."""
        result = await self.db.execute(
            select(Agent).where(Agent.hostname == hostname)
        )
        agent = result.scalar_one_or_none()

        if agent:
            agent.last_seen = datetime.utcnow()
            agent.status = AgentStatus.ONLINE.value
            await self.db.commit()

    async def get_all_agents(self, include_inactive: bool = False) -> list[Agent]:
        """Get all registered agents."""
        query = select(Agent)
        if not include_inactive:
            query = query.where(Agent.is_active == True)
        query = query.order_by(Agent.hostname)

        result = await self.db.execute(query)
        agents = result.scalars().all()

        # Update status based on last_seen
        config = get_config()
        stale_threshold = timedelta(minutes=config.monitoring.agent_stale_threshold_minutes)
        offline_threshold = timedelta(minutes=config.monitoring.agent_offline_threshold_minutes)
        now = datetime.utcnow()

        ws_manager = get_websocket_manager()

        for agent in agents:
            if ws_manager.is_agent_connected(agent.hostname):
                agent.status = AgentStatus.ONLINE.value
            elif agent.last_seen:
                time_since = now - agent.last_seen
                if time_since > offline_threshold:
                    agent.status = AgentStatus.OFFLINE.value
                elif time_since > stale_threshold:
                    agent.status = AgentStatus.STALE.value
                else:
                    agent.status = AgentStatus.ONLINE.value

        return list(agents)

    async def get_agent(self, hostname: str) -> Optional[Agent]:
        """Get a specific agent by hostname."""
        result = await self.db.execute(
            select(Agent).where(Agent.hostname == hostname)
        )
        return result.scalar_one_or_none()

    # ==================== Threat Events ====================

    async def record_threat_event(self, hostname: str, log_entry: UFWLogEntry) -> ThreatEvent:
        """Record a new threat event from a UFW log entry."""
        # Perform GeoIP lookup
        geo = self.geoip.lookup(log_entry.source_ip)

        event = ThreatEvent(
            agent_hostname=hostname,
            source_ip=log_entry.source_ip,
            source_port=log_entry.source_port,
            dest_ip=log_entry.dest_ip,
            dest_port=log_entry.dest_port,
            protocol=log_entry.protocol,
            country_code=geo.country_code,
            country_name=geo.country_name,
            latitude=geo.latitude,
            longitude=geo.longitude,
            city=geo.city,
            raw_log=log_entry.raw_log,
            event_time=log_entry.timestamp
        )

        self.db.add(event)
        await self.db.commit()
        await self.db.refresh(event)
        return event

    async def get_recent_threats(
        self,
        minutes: int = 60,
        limit: int = 1000
    ) -> list[ThreatEvent]:
        """Get recent threat events."""
        since = datetime.utcnow() - timedelta(minutes=minutes)

        result = await self.db.execute(
            select(ThreatEvent)
            .where(ThreatEvent.event_time >= since)
            .order_by(ThreatEvent.event_time.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_threat_summary(
        self,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None
    ) -> dict[str, Any]:
        """Get aggregated threat statistics."""
        if not end_time:
            end_time = datetime.utcnow()
        if not start_time:
            start_time = end_time - timedelta(hours=24)

        # Total events
        total_result = await self.db.execute(
            select(func.count(ThreatEvent.id))
            .where(ThreatEvent.event_time >= start_time)
            .where(ThreatEvent.event_time <= end_time)
        )
        total_events = total_result.scalar() or 0

        # Unique IPs
        unique_ips_result = await self.db.execute(
            select(func.count(func.distinct(ThreatEvent.source_ip)))
            .where(ThreatEvent.event_time >= start_time)
            .where(ThreatEvent.event_time <= end_time)
        )
        unique_ips = unique_ips_result.scalar() or 0

        # Top countries
        countries_result = await self.db.execute(
            select(
                ThreatEvent.country_code,
                ThreatEvent.country_name,
                func.count(ThreatEvent.id).label('count')
            )
            .where(ThreatEvent.event_time >= start_time)
            .where(ThreatEvent.event_time <= end_time)
            .where(ThreatEvent.country_code.isnot(None))
            .group_by(ThreatEvent.country_code, ThreatEvent.country_name)
            .order_by(func.count(ThreatEvent.id).desc())
            .limit(10)
        )
        top_countries = [
            {"code": row.country_code, "name": row.country_name, "count": row.count}
            for row in countries_result
        ]

        # Top targeted ports
        ports_result = await self.db.execute(
            select(
                ThreatEvent.dest_port,
                func.count(ThreatEvent.id).label('count')
            )
            .where(ThreatEvent.event_time >= start_time)
            .where(ThreatEvent.event_time <= end_time)
            .where(ThreatEvent.dest_port.isnot(None))
            .group_by(ThreatEvent.dest_port)
            .order_by(func.count(ThreatEvent.id).desc())
            .limit(10)
        )
        top_ports = [
            {"port": row.dest_port, "count": row.count}
            for row in ports_result
        ]

        # Events by hour (for chart)
        hourly_result = await self.db.execute(
            select(
                func.strftime('%Y-%m-%d %H:00', ThreatEvent.event_time).label('hour'),
                func.count(ThreatEvent.id).label('count')
            )
            .where(ThreatEvent.event_time >= start_time)
            .where(ThreatEvent.event_time <= end_time)
            .group_by(func.strftime('%Y-%m-%d %H:00', ThreatEvent.event_time))
            .order_by(func.strftime('%Y-%m-%d %H:00', ThreatEvent.event_time))
        )
        hourly_counts = [
            {"hour": row.hour, "count": row.count}
            for row in hourly_result
        ]

        return {
            "total_events": total_events,
            "unique_ips": unique_ips,
            "top_countries": top_countries,
            "top_ports": top_ports,
            "hourly_counts": hourly_counts,
            "period": {
                "start": start_time.isoformat(),
                "end": end_time.isoformat()
            }
        }

    async def get_map_data(
        self,
        minutes: int = 60,
        use_aggregates: bool = False
    ) -> list[dict[str, Any]]:
        """
        Get threat data formatted for map visualization.

        Returns list of points with lat/lng and count.
        """
        if use_aggregates:
            # Use aggregated data for historical views
            since = datetime.utcnow() - timedelta(minutes=minutes)
            result = await self.db.execute(
                select(
                    CountryAggregate.country_code,
                    CountryAggregate.country_name,
                    CountryAggregate.latitude,
                    CountryAggregate.longitude,
                    func.sum(CountryAggregate.event_count).label('count')
                )
                .where(CountryAggregate.hour_bucket >= since)
                .group_by(
                    CountryAggregate.country_code,
                    CountryAggregate.country_name,
                    CountryAggregate.latitude,
                    CountryAggregate.longitude
                )
            )
        else:
            # Use raw events for recent data
            since = datetime.utcnow() - timedelta(minutes=minutes)
            result = await self.db.execute(
                select(
                    ThreatEvent.country_code,
                    ThreatEvent.country_name,
                    ThreatEvent.latitude,
                    ThreatEvent.longitude,
                    func.count(ThreatEvent.id).label('count')
                )
                .where(ThreatEvent.event_time >= since)
                .where(ThreatEvent.latitude.isnot(None))
                .where(ThreatEvent.longitude.isnot(None))
                .group_by(
                    ThreatEvent.country_code,
                    ThreatEvent.country_name,
                    ThreatEvent.latitude,
                    ThreatEvent.longitude
                )
            )

        points = []
        for row in result:
            if row.latitude and row.longitude:
                points.append({
                    "lat": row.latitude,
                    "lng": row.longitude,
                    "count": row.count,
                    "country_code": row.country_code,
                    "country_name": row.country_name
                })

        return points

    # ==================== Health Checks ====================

    async def record_health_check(
        self,
        hostname: str,
        check_name: str,
        check_type: str,
        is_healthy: bool,
        check_time: datetime,
        latency_ms: Optional[float] = None,
        message: Optional[str] = None,
        details: Optional[str] = None
    ) -> HealthCheck:
        """Record a health check result from an agent."""
        check = HealthCheck(
            agent_hostname=hostname,
            check_name=check_name,
            check_type=check_type,
            is_healthy=is_healthy,
            latency_ms=latency_ms,
            message=message,
            details=details,
            check_time=check_time
        )

        self.db.add(check)
        await self.db.commit()
        await self.db.refresh(check)
        return check

    async def get_latest_health_checks(self, hostname: Optional[str] = None) -> list[dict[str, Any]]:
        """Get the most recent health check for each agent/check combination."""
        # Subquery to get max check_time per agent/check_name combination
        subquery = (
            select(
                HealthCheck.agent_hostname,
                HealthCheck.check_name,
                func.max(HealthCheck.check_time).label('max_time')
            )
            .group_by(HealthCheck.agent_hostname, HealthCheck.check_name)
            .subquery()
        )

        query = (
            select(HealthCheck)
            .join(
                subquery,
                (HealthCheck.agent_hostname == subquery.c.agent_hostname) &
                (HealthCheck.check_name == subquery.c.check_name) &
                (HealthCheck.check_time == subquery.c.max_time)
            )
        )

        if hostname:
            query = query.where(HealthCheck.agent_hostname == hostname)

        result = await self.db.execute(query)
        checks = result.scalars().all()

        return [
            {
                "hostname": c.agent_hostname,
                "check_name": c.check_name,
                "check_type": c.check_type,
                "is_healthy": c.is_healthy,
                "latency_ms": c.latency_ms,
                "message": c.message,
                "check_time": c.check_time.isoformat()
            }
            for c in checks
        ]

    # ==================== Data Retention ====================

    async def aggregate_old_events(self) -> int:
        """
        Aggregate threat events older than retention period.

        Returns number of events aggregated.
        """
        config = get_config()
        cutoff = datetime.utcnow() - timedelta(days=config.monitoring.raw_event_retention_days)

        # Get events to aggregate, grouped by country and hour
        result = await self.db.execute(
            select(
                ThreatEvent.country_code,
                ThreatEvent.country_name,
                ThreatEvent.latitude,
                ThreatEvent.longitude,
                func.strftime('%Y-%m-%d %H:00:00', ThreatEvent.event_time).label('hour'),
                func.count(ThreatEvent.id).label('event_count'),
                func.count(func.distinct(ThreatEvent.source_ip)).label('unique_ips')
            )
            .where(ThreatEvent.event_time < cutoff)
            .where(ThreatEvent.country_code.isnot(None))
            .group_by(
                ThreatEvent.country_code,
                ThreatEvent.country_name,
                ThreatEvent.latitude,
                ThreatEvent.longitude,
                func.strftime('%Y-%m-%d %H:00:00', ThreatEvent.event_time)
            )
        )

        aggregated_count = 0
        for row in result:
            hour_bucket = datetime.strptime(row.hour, '%Y-%m-%d %H:%M:%S')

            # Check if aggregate already exists
            existing = await self.db.execute(
                select(CountryAggregate)
                .where(CountryAggregate.country_code == row.country_code)
                .where(CountryAggregate.hour_bucket == hour_bucket)
            )
            existing_agg = existing.scalar_one_or_none()

            if existing_agg:
                existing_agg.event_count += row.event_count
                existing_agg.unique_ips += row.unique_ips
            else:
                agg = CountryAggregate(
                    country_code=row.country_code,
                    country_name=row.country_name or "Unknown",
                    hour_bucket=hour_bucket,
                    event_count=row.event_count,
                    unique_ips=row.unique_ips,
                    latitude=row.latitude or 0.0,
                    longitude=row.longitude or 0.0
                )
                self.db.add(agg)

            aggregated_count += row.event_count

        # Delete old events
        await self.db.execute(
            delete(ThreatEvent).where(ThreatEvent.event_time < cutoff)
        )

        # Delete old aggregates beyond retention
        aggregate_cutoff = datetime.utcnow() - timedelta(days=config.monitoring.aggregate_retention_days)
        await self.db.execute(
            delete(CountryAggregate).where(CountryAggregate.hour_bucket < aggregate_cutoff)
        )

        # Delete old health checks (keep 7 days)
        health_check_cutoff = datetime.utcnow() - timedelta(days=7)
        await self.db.execute(
            delete(HealthCheck).where(HealthCheck.check_time < health_check_cutoff)
        )

        await self.db.commit()
        return aggregated_count

    async def cleanup_stale_agents(self) -> int:
        """Mark agents as offline if they haven't reported recently."""
        config = get_config()
        offline_threshold = datetime.utcnow() - timedelta(
            minutes=config.monitoring.agent_offline_threshold_minutes
        )

        result = await self.db.execute(
            select(Agent)
            .where(Agent.last_seen < offline_threshold)
            .where(Agent.status != AgentStatus.OFFLINE.value)
        )
        stale_agents = result.scalars().all()

        for agent in stale_agents:
            agent.status = AgentStatus.OFFLINE.value

        await self.db.commit()
        return len(stale_agents)
