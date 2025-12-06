import { useState, useEffect } from 'react';
import { monitoringApi } from '../../services/api';
import type { HostMetrics as HostMetricsType } from '../../types';
import {
  Cpu,
  HardDrive,
  MemoryStick,
  Network,
  Clock,
  Activity,
  Server,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from 'lucide-react';

interface HostMetricsProps {
  prometheusAvailable: boolean;
}

export default function HostMetrics({ prometheusAvailable }: HostMetricsProps) {
  const [hosts, setHosts] = useState<string[]>([]);
  const [metricsData, setMetricsData] = useState<Record<string, {
    hostname: string;
    instance: string;
    cpu_usage_percent: number | null;
    memory_usage_percent: number | null;
    disk_usage_percent: number | null;
    network_rx_bytes_per_sec: number | null;
    network_tx_bytes_per_sec: number | null;
    uptime_seconds: number | null;
    load_average_1m: number | null;
  }>>({});
  const [selectedHost, setSelectedHost] = useState<string | null>(null);
  const [detailedMetrics, setDetailedMetrics] = useState<HostMetricsType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (prometheusAvailable) {
      loadMetrics();
      const interval = setInterval(loadMetrics, 30000); // Refresh every 30s
      return () => clearInterval(interval);
    }
  }, [prometheusAvailable]);

  const loadMetrics = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await monitoringApi.getAllHostMetrics();
      const metricsMap: typeof metricsData = {};
      data.forEach(m => {
        metricsMap[m.instance] = m;
      });
      setMetricsData(metricsMap);
      setHosts(data.map(m => m.instance));
    } catch (err) {
      setError('Failed to load metrics');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDetailedMetrics = async (instance: string) => {
    try {
      const data = await monitoringApi.getHostMetrics(instance);
      setDetailedMetrics(data);
    } catch (err) {
      console.error('Failed to load detailed metrics:', err);
    }
  };

  const handleHostClick = (instance: string) => {
    if (selectedHost === instance) {
      setSelectedHost(null);
      setDetailedMetrics(null);
    } else {
      setSelectedHost(instance);
      loadDetailedMetrics(instance);
    }
  };

  if (!prometheusAvailable) {
    return (
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <div className="text-center py-8">
          <Server size={48} className="mx-auto mb-4 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-400 mb-2">Prometheus Not Available</h3>
          <p className="text-gray-500 text-sm">
            Configure Prometheus connection to view host metrics
          </p>
        </div>
      </div>
    );
  }

  const formatBytes = (bytes: number | null): string => {
    if (bytes === null) return 'N/A';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let value = bytes;
    while (value >= 1024 && i < units.length - 1) {
      value /= 1024;
      i++;
    }
    return `${value.toFixed(1)} ${units[i]}`;
  };

  const formatBytesPerSec = (bps: number | null): string => {
    if (bps === null) return 'N/A';
    return `${formatBytes(bps)}/s`;
  };

  const formatUptime = (seconds: number | null): string => {
    if (seconds === null) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    if (days > 0) return `${days}d ${hours}h`;
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Activity size={20} className="text-blue-400" />
          Host Metrics
        </h3>
        <button
          onClick={loadMetrics}
          disabled={isLoading}
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
        >
          <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-500/10 border-b border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Host List */}
      <div className="divide-y divide-gray-800">
        {isLoading && hosts.length === 0 ? (
          <div className="p-6 text-center text-gray-500">Loading hosts...</div>
        ) : hosts.length === 0 ? (
          <div className="p-6 text-center text-gray-500">No hosts found</div>
        ) : (
          hosts.map(instance => {
            const metrics = metricsData[instance];
            const isExpanded = selectedHost === instance;

            return (
              <div key={instance} className="bg-gray-900 hover:bg-gray-800/50 transition-colors">
                {/* Host Summary Row */}
                <div
                  className="px-4 py-3 cursor-pointer flex items-center gap-4"
                  onClick={() => handleHostClick(instance)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Server size={16} className="text-gray-500" />
                      <span className="font-medium text-white truncate">
                        {metrics?.hostname || instance}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{instance}</div>
                  </div>

                  {/* Quick Metrics */}
                  <div className="hidden md:flex items-center gap-6 text-sm">
                    <MetricBadge
                      icon={Cpu}
                      value={metrics?.cpu_usage_percent}
                      format={(v) => `${v?.toFixed(1)}%`}
                      thresholds={{ warn: 70, crit: 90 }}
                    />
                    <MetricBadge
                      icon={MemoryStick}
                      value={metrics?.memory_usage_percent}
                      format={(v) => `${v?.toFixed(1)}%`}
                      thresholds={{ warn: 80, crit: 95 }}
                    />
                    <MetricBadge
                      icon={HardDrive}
                      value={metrics?.disk_usage_percent}
                      format={(v) => `${v?.toFixed(1)}%`}
                      thresholds={{ warn: 80, crit: 90 }}
                    />
                  </div>

                  {/* Expand/Collapse */}
                  {isExpanded ? (
                    <ChevronUp size={20} className="text-gray-500" />
                  ) : (
                    <ChevronDown size={20} className="text-gray-500" />
                  )}
                </div>

                {/* Expanded Details */}
                {isExpanded && detailedMetrics && (
                  <div className="px-4 pb-4 pt-2 border-t border-gray-800/50 bg-gray-800/30">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {/* CPU */}
                      <MetricCard
                        icon={Cpu}
                        title="CPU Usage"
                        value={detailedMetrics.cpu_usage_percent}
                        format={(v) => `${v.toFixed(1)}%`}
                        thresholds={{ warn: 70, crit: 90 }}
                        showProgress
                      />

                      {/* Memory */}
                      <MetricCard
                        icon={MemoryStick}
                        title="Memory Usage"
                        value={detailedMetrics.memory_usage_percent}
                        format={(v) => `${v.toFixed(1)}%`}
                        subtitle={`${formatBytes(detailedMetrics.memory_used_bytes)} / ${formatBytes(detailedMetrics.memory_total_bytes)}`}
                        thresholds={{ warn: 80, crit: 95 }}
                        showProgress
                      />

                      {/* Disk */}
                      <MetricCard
                        icon={HardDrive}
                        title="Disk Usage"
                        value={detailedMetrics.disk_usage_percent}
                        format={(v) => `${v.toFixed(1)}%`}
                        subtitle={`${formatBytes(detailedMetrics.disk_used_bytes)} / ${formatBytes(detailedMetrics.disk_total_bytes)}`}
                        thresholds={{ warn: 80, crit: 90 }}
                        showProgress
                      />

                      {/* Network */}
                      <div className="bg-gray-800 rounded-lg p-3">
                        <div className="flex items-center gap-2 text-gray-400 mb-2">
                          <Network size={16} />
                          <span className="text-sm">Network</span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">RX:</span>
                            <span className="text-green-400 font-mono">
                              {formatBytesPerSec(detailedMetrics.network_rx_bytes_per_sec)}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">TX:</span>
                            <span className="text-blue-400 font-mono">
                              {formatBytesPerSec(detailedMetrics.network_tx_bytes_per_sec)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Load Average */}
                      <div className="bg-gray-800 rounded-lg p-3">
                        <div className="flex items-center gap-2 text-gray-400 mb-2">
                          <Activity size={16} />
                          <span className="text-sm">Load Average</span>
                        </div>
                        <div className="flex gap-3 text-sm font-mono">
                          <span className="text-white">{detailedMetrics.load_average_1m?.toFixed(2) || 'N/A'}</span>
                          <span className="text-gray-400">{detailedMetrics.load_average_5m?.toFixed(2) || 'N/A'}</span>
                          <span className="text-gray-500">{detailedMetrics.load_average_15m?.toFixed(2) || 'N/A'}</span>
                        </div>
                        <div className="flex gap-3 text-xs text-gray-500 mt-1">
                          <span>1m</span>
                          <span>5m</span>
                          <span>15m</span>
                        </div>
                      </div>

                      {/* Uptime */}
                      <div className="bg-gray-800 rounded-lg p-3">
                        <div className="flex items-center gap-2 text-gray-400 mb-2">
                          <Clock size={16} />
                          <span className="text-sm">Uptime</span>
                        </div>
                        <div className="text-xl font-mono text-white">
                          {formatUptime(detailedMetrics.uptime_seconds)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function MetricBadge({
  icon: Icon,
  value,
  format,
  thresholds,
}: {
  icon: typeof Cpu;
  value: number | null | undefined;
  format: (v: number | null) => string;
  thresholds: { warn: number; crit: number };
}) {
  const getColor = (v: number | null | undefined) => {
    if (v === null || v === undefined) return 'text-gray-500';
    if (v >= thresholds.crit) return 'text-red-400';
    if (v >= thresholds.warn) return 'text-amber-400';
    return 'text-green-400';
  };

  return (
    <div className="flex items-center gap-1.5">
      <Icon size={14} className="text-gray-500" />
      <span className={`font-mono ${getColor(value)}`}>
        {value !== null && value !== undefined ? format(value) : 'N/A'}
      </span>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  title,
  value,
  format,
  subtitle,
  thresholds,
  showProgress,
}: {
  icon: typeof Cpu;
  title: string;
  value: number | null;
  format: (v: number) => string;
  subtitle?: string;
  thresholds: { warn: number; crit: number };
  showProgress?: boolean;
}) {
  const getColor = (v: number | null) => {
    if (v === null) return 'text-gray-500';
    if (v >= thresholds.crit) return 'text-red-400';
    if (v >= thresholds.warn) return 'text-amber-400';
    return 'text-green-400';
  };

  const getProgressColor = (v: number | null) => {
    if (v === null) return 'bg-gray-600';
    if (v >= thresholds.crit) return 'bg-red-500';
    if (v >= thresholds.warn) return 'bg-amber-500';
    return 'bg-green-500';
  };

  return (
    <div className="bg-gray-800 rounded-lg p-3">
      <div className="flex items-center gap-2 text-gray-400 mb-2">
        <Icon size={16} />
        <span className="text-sm">{title}</span>
      </div>
      <div className={`text-2xl font-mono ${getColor(value)}`}>
        {value !== null ? format(value) : 'N/A'}
      </div>
      {subtitle && <div className="text-xs text-gray-500 mt-1">{subtitle}</div>}
      {showProgress && value !== null && (
        <div className="mt-2 h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full ${getProgressColor(value)} transition-all duration-300`}
            style={{ width: `${Math.min(value, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
