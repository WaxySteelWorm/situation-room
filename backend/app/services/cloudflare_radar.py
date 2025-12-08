"""Cloudflare Radar service for BGP monitoring."""

import json
import logging
from datetime import datetime, timedelta
from typing import Optional

import httpx
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_config, get_cloudflare_radar_api_key
from ..models.network import BGPEvent, BGPEventType, BGPPrefixStatus

logger = logging.getLogger(__name__)

# Cloudflare Radar API base URL
RADAR_API_BASE = "https://api.cloudflare.com/client/v4/radar"


class CloudflareRadarService:
    """Service for interacting with Cloudflare Radar BGP API."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.config = get_config()
        self.api_key = get_cloudflare_radar_api_key()
        self.asn = self.config.network.cloudflare_radar.asn

    def _get_headers(self) -> dict:
        """Get API request headers."""
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def is_available(self) -> bool:
        """Check if Cloudflare Radar API is available and configured."""
        if not self.api_key or not self.asn:
            return False

        try:
            async with httpx.AsyncClient() as client:
                # Use AS entity lookup which works reliably
                response = await client.get(
                    f"{RADAR_API_BASE}/entities/asns/{self.asn}",
                    headers=self._get_headers(),
                    timeout=10.0,
                )
                return response.status_code == 200
        except Exception as e:
            logger.error(f"Cloudflare Radar API check failed: {e}")
            return False

    async def fetch_bgp_routes(self) -> dict:
        """Fetch BGP route information for the configured ASN."""
        if not self.api_key or not self.asn:
            return {"error": "Cloudflare Radar not configured"}

        try:
            async with httpx.AsyncClient() as client:
                # Fetch routes for our ASN
                response = await client.get(
                    f"{RADAR_API_BASE}/bgp/routes/ases/{self.asn}",
                    headers=self._get_headers(),
                    timeout=30.0,
                )
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"Cloudflare Radar API error: {e.response.status_code}")
            return {"error": f"API error: {e.response.status_code}"}
        except Exception as e:
            logger.error(f"Failed to fetch BGP routes: {e}")
            return {"error": str(e)}

    async def fetch_prefix_origins(self) -> dict:
        """Fetch prefix origin information for the ASN."""
        if not self.api_key or not self.asn:
            return {"error": "Cloudflare Radar not configured"}

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{RADAR_API_BASE}/bgp/routes/pfx2as",
                    headers=self._get_headers(),
                    timeout=30.0,
                    params={"origin": self.asn}
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"Failed to fetch prefix origins: {e}")
            return {"error": str(e)}

    async def fetch_bgp_timeseries(self, hours: int = 24) -> dict:
        """Fetch BGP timeseries data showing route changes over time."""
        if not self.api_key or not self.asn:
            return {"error": "Cloudflare Radar not configured"}

        try:
            end_time = datetime.utcnow()
            start_time = end_time - timedelta(hours=hours)

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{RADAR_API_BASE}/bgp/timeseries",
                    headers=self._get_headers(),
                    timeout=30.0,
                    params={
                        "asn": self.asn,
                        "dateStart": start_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                        "dateEnd": end_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    }
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"Failed to fetch BGP timeseries: {e}")
            return {"error": str(e)}

    async def fetch_route_leaks(self) -> dict:
        """Fetch detected route leak events."""
        if not self.api_key or not self.asn:
            return {"error": "Cloudflare Radar not configured"}

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{RADAR_API_BASE}/bgp/leaks/events",
                    headers=self._get_headers(),
                    timeout=30.0,
                    params={
                        "involvedAsn": self.asn,
                        "perPage": 100,
                    }
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"Failed to fetch route leaks: {e}")
            return {"error": str(e)}

    async def fetch_hijacks(self) -> dict:
        """Fetch detected BGP hijack events."""
        if not self.api_key or not self.asn:
            return {"error": "Cloudflare Radar not configured"}

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{RADAR_API_BASE}/bgp/hijacks/events",
                    headers=self._get_headers(),
                    timeout=30.0,
                    params={
                        "involvedAsn": self.asn,
                        "perPage": 100,
                    }
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"Failed to fetch hijacks: {e}")
            return {"error": str(e)}

    async def fetch_as_overview(self) -> dict:
        """Fetch AS overview including prefix counts and peer information."""
        if not self.api_key or not self.asn:
            return {"error": "Cloudflare Radar not configured"}

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{RADAR_API_BASE}/entities/asns/{self.asn}",
                    headers=self._get_headers(),
                    timeout=30.0,
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"Failed to fetch AS overview: {e}")
            return {"error": str(e)}

    async def record_bgp_event(
        self,
        event_type: str,
        prefix: Optional[str] = None,
        as_path: Optional[list] = None,
        peer_asn: Optional[int] = None,
        peer_name: Optional[str] = None,
        peer_state: Optional[str] = None,
        description: Optional[str] = None,
        severity: str = "info",
        raw_data: Optional[dict] = None,
        event_time: Optional[datetime] = None,
    ) -> BGPEvent:
        """Record a BGP event to the database."""
        event = BGPEvent(
            event_type=event_type,
            asn=self.asn,
            prefix=prefix,
            as_path=json.dumps(as_path) if as_path else None,
            origin_asn=as_path[-1] if as_path else None,
            peer_asn=peer_asn,
            peer_name=peer_name,
            peer_state=peer_state,
            description=description,
            severity=severity,
            raw_data=json.dumps(raw_data) if raw_data else None,
            event_time=event_time or datetime.utcnow(),
        )

        self.db.add(event)
        await self.db.commit()
        await self.db.refresh(event)

        logger.info(f"Recorded BGP event: {event_type} for prefix {prefix}")
        return event

    async def update_prefix_status(
        self,
        prefix: str,
        is_visible: bool = True,
        visibility_count: Optional[int] = None,
        as_path: Optional[list] = None,
    ) -> BGPPrefixStatus:
        """Update or create a prefix status record."""
        now = datetime.utcnow()

        # Check if prefix status exists
        result = await self.db.execute(
            select(BGPPrefixStatus).where(
                BGPPrefixStatus.asn == self.asn,
                BGPPrefixStatus.prefix == prefix,
            )
        )
        status = result.scalar_one_or_none()

        if status:
            status.is_visible = is_visible
            status.visibility_count = visibility_count
            status.as_path = json.dumps(as_path) if as_path else None
            status.origin_asn = as_path[-1] if as_path else None
            status.last_seen = now
        else:
            status = BGPPrefixStatus(
                asn=self.asn,
                prefix=prefix,
                is_visible=is_visible,
                visibility_count=visibility_count,
                as_path=json.dumps(as_path) if as_path else None,
                origin_asn=as_path[-1] if as_path else None,
                first_seen=now,
                last_seen=now,
            )
            self.db.add(status)

        await self.db.commit()
        await self.db.refresh(status)
        return status

    async def get_recent_events(self, hours: int = 24, limit: int = 100) -> list[BGPEvent]:
        """Get recent BGP events."""
        cutoff = datetime.utcnow() - timedelta(hours=hours)

        result = await self.db.execute(
            select(BGPEvent)
            .where(BGPEvent.event_time >= cutoff)
            .order_by(desc(BGPEvent.event_time))
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_prefix_statuses(self) -> list[BGPPrefixStatus]:
        """Get all current prefix statuses for our ASN."""
        result = await self.db.execute(
            select(BGPPrefixStatus)
            .where(BGPPrefixStatus.asn == self.asn)
            .order_by(BGPPrefixStatus.prefix)
        )
        return list(result.scalars().all())

    async def get_unalerted_events(self, severity_min: str = "warning") -> list[BGPEvent]:
        """Get events that need alerts sent."""
        severity_order = {"info": 0, "warning": 1, "critical": 2}
        min_level = severity_order.get(severity_min, 1)

        result = await self.db.execute(
            select(BGPEvent)
            .where(
                BGPEvent.alert_sent == False,
                BGPEvent.severity.in_(
                    [s for s, level in severity_order.items() if level >= min_level]
                )
            )
            .order_by(BGPEvent.event_time)
        )
        return list(result.scalars().all())

    async def mark_event_alerted(self, event_id: int) -> None:
        """Mark an event as having had its alert sent."""
        result = await self.db.execute(
            select(BGPEvent).where(BGPEvent.id == event_id)
        )
        event = result.scalar_one_or_none()
        if event:
            event.alert_sent = True
            event.alert_sent_at = datetime.utcnow()
            await self.db.commit()

    async def get_bgp_summary(self) -> dict:
        """Get a summary of current BGP status."""
        # Get overview from API
        overview = await self.fetch_as_overview()

        # Get prefix count from database
        result = await self.db.execute(
            select(BGPPrefixStatus)
            .where(
                BGPPrefixStatus.asn == self.asn,
                BGPPrefixStatus.is_visible == True,
            )
        )
        visible_prefixes = list(result.scalars().all())

        # Get recent events count
        cutoff = datetime.utcnow() - timedelta(hours=24)
        result = await self.db.execute(
            select(BGPEvent)
            .where(BGPEvent.event_time >= cutoff)
        )
        recent_events = list(result.scalars().all())

        # Count by event type
        event_counts = {}
        for event in recent_events:
            event_counts[event.event_type] = event_counts.get(event.event_type, 0) + 1

        return {
            "asn": self.asn,
            "prefix_count": len(visible_prefixes),
            "prefixes": [
                {
                    "prefix": p.prefix,
                    "is_visible": p.is_visible,
                    "first_seen": p.first_seen.isoformat() if p.first_seen else None,
                    "last_seen": p.last_seen.isoformat() if p.last_seen else None,
                }
                for p in visible_prefixes[:10]  # Limit to first 10
            ],
            "recent_events_24h": len(recent_events),
            "event_counts": event_counts,
            "api_overview": overview.get("result", {}) if "result" in overview else None,
        }

    async def poll_and_update(self) -> dict:
        """Poll Cloudflare Radar for updates and store any changes."""
        results = {
            "routes_fetched": False,
            "events_recorded": 0,
            "prefixes_updated": 0,
            "errors": [],
        }

        try:
            # Fetch current routes
            routes_data = await self.fetch_bgp_routes()
            if "error" not in routes_data and "result" in routes_data:
                results["routes_fetched"] = True

                # Process routes and update prefix status
                routes = routes_data.get("result", {}).get("routes", [])
                for route in routes:
                    prefix = route.get("prefix")
                    as_path = route.get("asPath", [])
                    if prefix:
                        await self.update_prefix_status(
                            prefix=prefix,
                            is_visible=True,
                            as_path=as_path,
                        )
                        results["prefixes_updated"] += 1

            # Check for route leaks
            leaks_data = await self.fetch_route_leaks()
            if "error" not in leaks_data and "result" in leaks_data:
                events = leaks_data.get("result", {}).get("events", [])
                for leak in events:
                    await self.record_bgp_event(
                        event_type=BGPEventType.LEAK.value,
                        prefix=leak.get("prefix"),
                        description=f"Route leak detected: {leak.get('description', 'No description')}",
                        severity="warning",
                        raw_data=leak,
                        event_time=datetime.fromisoformat(leak["detectedTime"].replace("Z", "+00:00"))
                        if leak.get("detectedTime") else None,
                    )
                    results["events_recorded"] += 1

            # Check for hijacks
            hijacks_data = await self.fetch_hijacks()
            if "error" not in hijacks_data and "result" in hijacks_data:
                events = hijacks_data.get("result", {}).get("events", [])
                for hijack in events:
                    # Skip stale/historical events
                    if hijack.get("is_stale", False):
                        continue

                    # Check if event is recent (within last 7 days)
                    max_ts = hijack.get("max_hijack_ts")
                    if max_ts:
                        try:
                            event_time = datetime.fromisoformat(max_ts.replace("Z", "+00:00"))
                            if datetime.utcnow() - event_time.replace(tzinfo=None) > timedelta(days=7):
                                continue  # Skip events older than 7 days
                        except (ValueError, TypeError):
                            pass

                    # Get prefix from the prefixes array
                    prefixes = hijack.get("prefixes", [])
                    prefix = prefixes[0] if prefixes else None

                    # Build description
                    hijacker = hijack.get("hijacker_asn")
                    victims = hijack.get("victim_asns", [])
                    description = f"BGP hijack: AS{hijacker} announced {prefix}"
                    if victims:
                        description += f" (victim: AS{victims[0]})"

                    await self.record_bgp_event(
                        event_type=BGPEventType.HIJACK.value,
                        prefix=prefix,
                        peer_asn=hijacker,
                        description=description,
                        severity="critical",
                        raw_data=hijack,
                        event_time=datetime.fromisoformat(max_ts.replace("Z", "+00:00"))
                        if max_ts else None,
                    )
                    results["events_recorded"] += 1

        except Exception as e:
            logger.error(f"Error during poll_and_update: {e}")
            results["errors"].append(str(e))

        return results
