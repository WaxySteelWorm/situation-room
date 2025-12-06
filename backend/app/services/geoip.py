"""GeoIP lookup service using MaxMind GeoLite2 database."""

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from ..config import get_config

logger = logging.getLogger(__name__)

# Try to import geoip2, but make it optional
try:
    import geoip2.database
    import geoip2.errors
    GEOIP_AVAILABLE = True
except ImportError:
    GEOIP_AVAILABLE = False
    logger.warning("geoip2 not installed, GeoIP lookups will be disabled")


@dataclass
class GeoIPResult:
    """Result of a GeoIP lookup."""
    ip: str
    country_code: Optional[str] = None
    country_name: Optional[str] = None
    city: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class GeoIPService:
    """Service for IP geolocation lookups using MaxMind GeoLite2."""

    def __init__(self):
        self._reader: Optional["geoip2.database.Reader"] = None
        self._db_path: Optional[str] = None
        self._initialized = False

    def _initialize(self) -> bool:
        """Initialize the GeoIP database reader."""
        if self._initialized:
            return self._reader is not None

        if not GEOIP_AVAILABLE:
            self._initialized = True
            return False

        config = get_config()
        db_path = config.monitoring.geoip_db_path

        if not Path(db_path).exists():
            logger.warning(f"GeoIP database not found at {db_path}")
            self._initialized = True
            return False

        try:
            self._reader = geoip2.database.Reader(db_path)
            self._db_path = db_path
            logger.info(f"GeoIP database loaded from {db_path}")
            self._initialized = True
            return True
        except Exception as e:
            logger.error(f"Failed to load GeoIP database: {e}")
            self._initialized = True
            return False

    def lookup(self, ip: str) -> GeoIPResult:
        """
        Look up geographic information for an IP address.

        Args:
            ip: IPv4 or IPv6 address

        Returns:
            GeoIPResult with available geographic data
        """
        result = GeoIPResult(ip=ip)

        if not self._initialize() or self._reader is None:
            return result

        # Skip private/reserved IPs
        if self._is_private_ip(ip):
            return result

        try:
            response = self._reader.city(ip)

            result.country_code = response.country.iso_code
            result.country_name = response.country.name
            result.city = response.city.name if response.city else None
            result.latitude = response.location.latitude
            result.longitude = response.location.longitude

        except geoip2.errors.AddressNotFoundError:
            logger.debug(f"IP address not found in GeoIP database: {ip}")
        except Exception as e:
            logger.error(f"GeoIP lookup failed for {ip}: {e}")

        return result

    def _is_private_ip(self, ip: str) -> bool:
        """Check if an IP address is private/reserved."""
        import ipaddress
        try:
            addr = ipaddress.ip_address(ip)
            return addr.is_private or addr.is_reserved or addr.is_loopback
        except ValueError:
            return True

    def close(self):
        """Close the database reader."""
        if self._reader:
            self._reader.close()
            self._reader = None
            self._initialized = False


# Global singleton instance
_geoip_service: Optional[GeoIPService] = None


def get_geoip_service() -> GeoIPService:
    """Get the global GeoIP service instance."""
    global _geoip_service
    if _geoip_service is None:
        _geoip_service = GeoIPService()
    return _geoip_service
