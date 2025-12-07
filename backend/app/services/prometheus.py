"""Prometheus client service for querying metrics."""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Optional

import httpx

from ..config import get_config

logger = logging.getLogger(__name__)


@dataclass
class MetricValue:
    """A single metric value with timestamp."""
    timestamp: datetime
    value: float


@dataclass
class MetricSeries:
    """A series of metric values with labels."""
    metric_name: str
    labels: dict[str, str]
    values: list[MetricValue]


@dataclass
class HostMetrics:
    """Aggregated metrics for a single host."""
    hostname: str
    instance: str
    cpu_usage_percent: Optional[float] = None
    memory_usage_percent: Optional[float] = None
    memory_total_bytes: Optional[float] = None
    memory_used_bytes: Optional[float] = None
    disk_usage_percent: Optional[float] = None
    disk_total_bytes: Optional[float] = None
    disk_used_bytes: Optional[float] = None
    network_rx_bytes_per_sec: Optional[float] = None
    network_tx_bytes_per_sec: Optional[float] = None
    uptime_seconds: Optional[float] = None
    load_average_1m: Optional[float] = None
    load_average_5m: Optional[float] = None
    load_average_15m: Optional[float] = None


class PrometheusService:
    """Service for querying Prometheus metrics."""

    def __init__(self):
        self._base_url: Optional[str] = None
        self._client: Optional[httpx.AsyncClient] = None

    def _get_client(self) -> httpx.AsyncClient:
        """Get or create the HTTP client."""
        config = get_config()

        if self._client is None or self._base_url != config.monitoring.prometheus.url:
            if self._client:
                # Close old client synchronously is not ideal, but needed for URL changes
                pass
            self._base_url = config.monitoring.prometheus.url
            self._client = httpx.AsyncClient(
                base_url=self._base_url,
                timeout=30.0
            )

        return self._client

    async def is_available(self) -> bool:
        """Check if Prometheus is available."""
        config = get_config()
        if not config.monitoring.prometheus.enabled:
            return False

        try:
            client = self._get_client()
            response = await client.get("/api/v1/status/config")
            return response.status_code == 200
        except Exception as e:
            logger.error(f"Prometheus connection failed: {e}")
            return False

    async def query(self, query: str, time: Optional[datetime] = None) -> list[dict[str, Any]]:
        """
        Execute an instant query.

        Args:
            query: PromQL query string
            time: Optional evaluation timestamp

        Returns:
            List of result dictionaries
        """
        config = get_config()
        if not config.monitoring.prometheus.enabled:
            return []

        try:
            client = self._get_client()
            params = {"query": query}
            if time:
                params["time"] = time.isoformat()

            response = await client.get("/api/v1/query", params=params)
            response.raise_for_status()
            data = response.json()

            if data.get("status") == "success":
                return data.get("data", {}).get("result", [])
            else:
                logger.error(f"Prometheus query failed: {data.get('error', 'Unknown error')}")
                return []

        except Exception as e:
            logger.error(f"Prometheus query error: {e}")
            return []

    async def query_range(
        self,
        query: str,
        start: datetime,
        end: datetime,
        step: str = "60s"
    ) -> list[MetricSeries]:
        """
        Execute a range query.

        Args:
            query: PromQL query string
            start: Start timestamp
            end: End timestamp
            step: Query resolution step (default: 60s)

        Returns:
            List of MetricSeries
        """
        config = get_config()
        if not config.monitoring.prometheus.enabled:
            return []

        try:
            client = self._get_client()
            params = {
                "query": query,
                "start": start.isoformat(),
                "end": end.isoformat(),
                "step": step
            }

            response = await client.get("/api/v1/query_range", params=params)
            response.raise_for_status()
            data = response.json()

            if data.get("status") != "success":
                logger.error(f"Prometheus range query failed: {data.get('error', 'Unknown error')}")
                return []

            results = []
            for result in data.get("data", {}).get("result", []):
                metric = result.get("metric", {})
                values = [
                    MetricValue(
                        timestamp=datetime.fromtimestamp(ts),
                        value=float(val)
                    )
                    for ts, val in result.get("values", [])
                ]
                results.append(MetricSeries(
                    metric_name=metric.get("__name__", ""),
                    labels=metric,
                    values=values
                ))

            return results

        except Exception as e:
            logger.error(f"Prometheus range query error: {e}")
            return []

    async def get_hosts(self) -> list[str]:
        """Get list of all monitored hosts (instances with node_exporter)."""
        # Look for instances on port 9100 (node_exporter) or with node metrics
        results = await self.query('up{instance=~".*:9100"}')
        if not results:
            # Fallback: look for any instance with node_cpu metric
            results = await self.query('count by (instance) (node_cpu_seconds_total)')

        hosts = set()
        for result in results:
            instance = result.get("metric", {}).get("instance", "")
            if instance:
                hosts.add(instance)
        return sorted(hosts)

    async def get_host_metrics(self, instance: str) -> Optional[HostMetrics]:
        """
        Get current metrics for a specific host.

        Args:
            instance: The Prometheus instance label (e.g., "host.example.com:9100")

        Returns:
            HostMetrics object with current values
        """
        # Extract hostname from instance
        hostname = instance.split(":")[0]

        metrics = HostMetrics(hostname=hostname, instance=instance)

        # Query multiple metrics in parallel would be more efficient,
        # but for simplicity we'll do them sequentially
        queries = {
            "cpu": f'100 - (avg(irate(node_cpu_seconds_total{{instance="{instance}",mode="idle"}}[5m])) * 100)',
            "memory_used": f'node_memory_MemTotal_bytes{{instance="{instance}"}} - node_memory_MemAvailable_bytes{{instance="{instance}"}}',
            "memory_total": f'node_memory_MemTotal_bytes{{instance="{instance}"}}',
            "disk_used": f'sum(node_filesystem_size_bytes{{instance="{instance}",fstype!~"tmpfs|overlay"}}) - sum(node_filesystem_avail_bytes{{instance="{instance}",fstype!~"tmpfs|overlay"}})',
            "disk_total": f'sum(node_filesystem_size_bytes{{instance="{instance}",fstype!~"tmpfs|overlay"}})',
            "network_rx": f'sum(irate(node_network_receive_bytes_total{{instance="{instance}",device!~"lo|veth.*|docker.*|br-.*"}}[5m]))',
            "network_tx": f'sum(irate(node_network_transmit_bytes_total{{instance="{instance}",device!~"lo|veth.*|docker.*|br-.*"}}[5m]))',
            "uptime": f'time() - node_boot_time_seconds{{instance="{instance}"}}',
            "load_1m": f'node_load1{{instance="{instance}"}}',
            "load_5m": f'node_load5{{instance="{instance}"}}',
            "load_15m": f'node_load15{{instance="{instance}"}}',
        }

        for metric_name, query in queries.items():
            results = await self.query(query)
            if results and len(results) > 0:
                value = float(results[0].get("value", [0, 0])[1])

                if metric_name == "cpu":
                    metrics.cpu_usage_percent = value
                elif metric_name == "memory_used":
                    metrics.memory_used_bytes = value
                elif metric_name == "memory_total":
                    metrics.memory_total_bytes = value
                    if metrics.memory_used_bytes:
                        metrics.memory_usage_percent = (metrics.memory_used_bytes / value) * 100
                elif metric_name == "disk_used":
                    metrics.disk_used_bytes = value
                elif metric_name == "disk_total":
                    metrics.disk_total_bytes = value
                    if metrics.disk_used_bytes:
                        metrics.disk_usage_percent = (metrics.disk_used_bytes / value) * 100
                elif metric_name == "network_rx":
                    metrics.network_rx_bytes_per_sec = value
                elif metric_name == "network_tx":
                    metrics.network_tx_bytes_per_sec = value
                elif metric_name == "uptime":
                    metrics.uptime_seconds = value
                elif metric_name == "load_1m":
                    metrics.load_average_1m = value
                elif metric_name == "load_5m":
                    metrics.load_average_5m = value
                elif metric_name == "load_15m":
                    metrics.load_average_15m = value

        return metrics

    async def get_all_host_metrics(self) -> list[HostMetrics]:
        """Get metrics for all monitored hosts."""
        # Get all instances with node_exporter (port 9100)
        results = await self.query('up{instance=~".*:9100"}')
        instances = [r.get("metric", {}).get("instance", "") for r in results if r.get("value", [0, 1])[1] == "1"]

        # Get metrics for each host
        all_metrics = []
        for instance in instances:
            metrics = await self.get_host_metrics(instance)
            if metrics:
                all_metrics.append(metrics)

        return all_metrics

    async def get_metric_history(
        self,
        instance: str,
        metric: str,
        duration_hours: int = 24,
        step: str = "5m"
    ) -> list[MetricValue]:
        """
        Get historical values for a specific metric.

        Args:
            instance: The Prometheus instance label
            metric: One of: cpu, memory, disk, network_rx, network_tx
            duration_hours: How far back to query
            step: Query resolution

        Returns:
            List of MetricValue objects
        """
        end = datetime.utcnow()
        start = end - timedelta(hours=duration_hours)

        query_map = {
            "cpu": f'100 - (avg(irate(node_cpu_seconds_total{{instance="{instance}",mode="idle"}}[5m])) * 100)',
            "memory": f'100 * (1 - node_memory_MemAvailable_bytes{{instance="{instance}"}} / node_memory_MemTotal_bytes{{instance="{instance}"}})',
            "disk": f'100 * (1 - sum(node_filesystem_avail_bytes{{instance="{instance}",fstype!~"tmpfs|overlay"}}) / sum(node_filesystem_size_bytes{{instance="{instance}",fstype!~"tmpfs|overlay"}}))',
            "network_rx": f'sum(irate(node_network_receive_bytes_total{{instance="{instance}",device!~"lo|veth.*|docker.*|br-.*"}}[5m]))',
            "network_tx": f'sum(irate(node_network_transmit_bytes_total{{instance="{instance}",device!~"lo|veth.*|docker.*|br-.*"}}[5m]))',
        }

        query = query_map.get(metric)
        if not query:
            return []

        series_list = await self.query_range(query, start, end, step)
        if series_list:
            return series_list[0].values
        return []

    async def close(self):
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None


# Global singleton instance
_prometheus_service: Optional[PrometheusService] = None


def get_prometheus_service() -> PrometheusService:
    """Get the global Prometheus service instance."""
    global _prometheus_service
    if _prometheus_service is None:
        _prometheus_service = PrometheusService()
    return _prometheus_service
