import { useState, useEffect, useMemo } from 'react';
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
  AlertTriangle,
  CheckCircle,
  XCircle,
  ArrowUpDown,
  Search,
  Filter,
} from 'lucide-react';

interface HostMetricsProps {
  prometheusAvailable: boolean;
}

type SortField = 'hostname' | 'cpu' | 'memory' | 'disk' | 'load' | 'uptime';
type SortDirection = 'asc' | 'desc';
type StatusFilter = 'all' | 'critical' | 'warning' | 'healthy';

interface HostWithMetrics {
  instance: string;
  hostname: string;
  cpu_usage_percent: number | null;
  memory_usage_percent: number | null;
  disk_usage_percent: number | null;
  network_rx_bytes_per_sec: number | null;
  network_tx_bytes_per_sec: number | null;
  uptime_seconds: number | null;
  load_average_1m: number | null;
  load_average_5m: number | null;
  load_average_15m: number | null;
  memory_used_bytes?: number | null;
  memory_total_bytes?: number | null;
  disk_used_bytes?: number | null;
  disk_total_bytes?: number | null;
  status: 'critical' | 'warning' | 'healthy';
}

// Thresholds for alerts
const THRESHOLDS = {
  cpu: { warn: 70, crit: 90 },
  memory: { warn: 80, crit: 95 },
  disk: { warn: 80, crit: 90 },
  load: { warn: 5, crit: 10 },
};

function getHostStatus(host: HostWithMetrics): 'critical' | 'warning' | 'healthy' {
  const cpu = host.cpu_usage_percent ?? 0;
  const mem = host.memory_usage_percent ?? 0;
  const disk = host.disk_usage_percent ?? 0;
  const load = host.load_average_1m ?? 0;

  if (cpu >= THRESHOLDS.cpu.crit || mem >= THRESHOLDS.memory.crit ||
      disk >= THRESHOLDS.disk.crit || load >= THRESHOLDS.load.crit) {
    return 'critical';
  }
  if (cpu >= THRESHOLDS.cpu.warn || mem >= THRESHOLDS.memory.warn ||
      disk >= THRESHOLDS.disk.warn || load >= THRESHOLDS.load.warn) {
    return 'warning';
  }
  return 'healthy';
}

export default function HostMetrics({ prometheusAvailable }: HostMetricsProps) {
  const [hosts, setHosts] = useState<HostWithMetrics[]>([]);
  const [selectedHosts, setSelectedHosts] = useState<Set<string>>(new Set());
  const [expandedHost, setExpandedHost] = useState<string | null>(null);
  const [detailedMetrics, setDetailedMetrics] = useState<HostMetricsType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('hostname');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    if (prometheusAvailable) {
      loadMetrics();
      const interval = setInterval(loadMetrics, 30000);
      return () => clearInterval(interval);
    }
  }, [prometheusAvailable]);

  const loadMetrics = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await monitoringApi.getAllHostMetrics();
      const hostsWithStatus = data.map(m => ({
        ...m,
        status: getHostStatus(m as HostWithMetrics),
      })) as HostWithMetrics[];
      setHosts(hostsWithStatus);
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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleSelectAll = () => {
    if (selectedHosts.size === filteredAndSortedHosts.length) {
      setSelectedHosts(new Set());
    } else {
      setSelectedHosts(new Set(filteredAndSortedHosts.map(h => h.instance)));
    }
  };

  const handleSelectHost = (instance: string) => {
    const newSelected = new Set(selectedHosts);
    if (newSelected.has(instance)) {
      newSelected.delete(instance);
    } else {
      newSelected.add(instance);
    }
    setSelectedHosts(newSelected);
  };

  const handleExpandHost = (instance: string) => {
    if (expandedHost === instance) {
      setExpandedHost(null);
      setDetailedMetrics(null);
    } else {
      setExpandedHost(instance);
      loadDetailedMetrics(instance);
    }
  };

  const filteredAndSortedHosts = useMemo(() => {
    let result = [...hosts];

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(h =>
        h.hostname.toLowerCase().includes(query) ||
        h.instance.toLowerCase().includes(query)
      );
    }

    // Filter by status
    if (statusFilter !== 'all') {
      result = result.filter(h => h.status === statusFilter);
    }

    // Sort
    result.sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      switch (sortField) {
        case 'hostname':
          aVal = a.hostname.toLowerCase();
          bVal = b.hostname.toLowerCase();
          break;
        case 'cpu':
          aVal = a.cpu_usage_percent ?? -1;
          bVal = b.cpu_usage_percent ?? -1;
          break;
        case 'memory':
          aVal = a.memory_usage_percent ?? -1;
          bVal = b.memory_usage_percent ?? -1;
          break;
        case 'disk':
          aVal = a.disk_usage_percent ?? -1;
          bVal = b.disk_usage_percent ?? -1;
          break;
        case 'load':
          aVal = a.load_average_1m ?? -1;
          bVal = b.load_average_1m ?? -1;
          break;
        case 'uptime':
          aVal = a.uptime_seconds ?? -1;
          bVal = b.uptime_seconds ?? -1;
          break;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDirection === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    return result;
  }, [hosts, searchQuery, statusFilter, sortField, sortDirection]);

  // Summary stats
  const stats = useMemo(() => {
    const critical = hosts.filter(h => h.status === 'critical').length;
    const warning = hosts.filter(h => h.status === 'warning').length;
    const healthy = hosts.filter(h => h.status === 'healthy').length;
    const avgCpu = hosts.reduce((sum, h) => sum + (h.cpu_usage_percent ?? 0), 0) / (hosts.length || 1);
    const avgMem = hosts.reduce((sum, h) => sum + (h.memory_usage_percent ?? 0), 0) / (hosts.length || 1);
    const avgDisk = hosts.reduce((sum, h) => sum + (h.disk_usage_percent ?? 0), 0) / (hosts.length || 1);
    return { critical, warning, healthy, avgCpu, avgMem, avgDisk, total: hosts.length };
  }, [hosts]);

  if (!prometheusAvailable) {
    return (
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <div className="text-center py-8">
          <Server size={48} className="mx-auto mb-4 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-400 mb-2">Prometheus Not Available</h3>
          <p className="text-gray-500 text-sm">
            Configure Prometheus connection in config.yml to view host metrics
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'critical': return <XCircle size={16} className="text-red-500" />;
      case 'warning': return <AlertTriangle size={16} className="text-amber-500" />;
      default: return <CheckCircle size={16} className="text-green-500" />;
    }
  };

  const getMetricColor = (value: number | null, thresholds: { warn: number; crit: number }) => {
    if (value === null) return 'text-gray-500';
    if (value >= thresholds.crit) return 'text-red-400';
    if (value >= thresholds.warn) return 'text-amber-400';
    return 'text-green-400';
  };

  const getProgressColor = (value: number | null, thresholds: { warn: number; crit: number }) => {
    if (value === null) return 'bg-gray-600';
    if (value >= thresholds.crit) return 'bg-red-500';
    if (value >= thresholds.warn) return 'bg-amber-500';
    return 'bg-green-500';
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-3">
          <div className="text-xs text-gray-500 mb-1">Total Hosts</div>
          <div className="text-2xl font-bold text-white">{stats.total}</div>
        </div>
        <div
          className={`bg-gray-900 rounded-lg border border-gray-800 p-3 cursor-pointer transition-colors ${statusFilter === 'critical' ? 'ring-2 ring-red-500' : 'hover:bg-gray-800'}`}
          onClick={() => setStatusFilter(f => f === 'critical' ? 'all' : 'critical')}
        >
          <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            <XCircle size={12} className="text-red-500" /> Critical
          </div>
          <div className="text-2xl font-bold text-red-400">{stats.critical}</div>
        </div>
        <div
          className={`bg-gray-900 rounded-lg border border-gray-800 p-3 cursor-pointer transition-colors ${statusFilter === 'warning' ? 'ring-2 ring-amber-500' : 'hover:bg-gray-800'}`}
          onClick={() => setStatusFilter(f => f === 'warning' ? 'all' : 'warning')}
        >
          <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            <AlertTriangle size={12} className="text-amber-500" /> Warning
          </div>
          <div className="text-2xl font-bold text-amber-400">{stats.warning}</div>
        </div>
        <div
          className={`bg-gray-900 rounded-lg border border-gray-800 p-3 cursor-pointer transition-colors ${statusFilter === 'healthy' ? 'ring-2 ring-green-500' : 'hover:bg-gray-800'}`}
          onClick={() => setStatusFilter(f => f === 'healthy' ? 'all' : 'healthy')}
        >
          <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            <CheckCircle size={12} className="text-green-500" /> Healthy
          </div>
          <div className="text-2xl font-bold text-green-400">{stats.healthy}</div>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-3">
          <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            <Cpu size={12} /> Avg CPU
          </div>
          <div className={`text-2xl font-bold ${getMetricColor(stats.avgCpu, THRESHOLDS.cpu)}`}>
            {stats.avgCpu.toFixed(1)}%
          </div>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-3">
          <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            <MemoryStick size={12} /> Avg Memory
          </div>
          <div className={`text-2xl font-bold ${getMetricColor(stats.avgMem, THRESHOLDS.memory)}`}>
            {stats.avgMem.toFixed(1)}%
          </div>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-3">
          <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            <HardDrive size={12} /> Avg Disk
          </div>
          <div className={`text-2xl font-bold ${getMetricColor(stats.avgDisk, THRESHOLDS.disk)}`}>
            {stats.avgDisk.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Activity size={20} className="text-blue-400" />
            Host Metrics
            {selectedHosts.size > 0 && (
              <span className="text-sm text-gray-400 font-normal">
                ({selectedHosts.size} selected)
              </span>
            )}
          </h3>
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                placeholder="Search hosts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 w-48"
              />
            </div>
            {/* Status Filter */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="pl-3 pr-8 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white appearance-none focus:outline-none focus:border-blue-500"
              >
                <option value="all">All Status</option>
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
                <option value="healthy">Healthy</option>
              </select>
              <Filter size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            </div>
            {/* Refresh */}
            <button
              onClick={loadMetrics}
              disabled={isLoading}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 bg-red-500/10 border-b border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-800/50">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedHosts.size === filteredAndSortedHosts.length && filteredAndSortedHosts.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                  />
                </th>
                <th className="px-4 py-3 text-left">
                  <button
                    onClick={() => handleSort('hostname')}
                    className="flex items-center gap-1 text-xs font-medium text-gray-400 uppercase tracking-wider hover:text-white"
                  >
                    Host
                    <ArrowUpDown size={12} className={sortField === 'hostname' ? 'text-blue-400' : ''} />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Status</span>
                </th>
                <th className="px-4 py-3 text-left">
                  <button
                    onClick={() => handleSort('cpu')}
                    className="flex items-center gap-1 text-xs font-medium text-gray-400 uppercase tracking-wider hover:text-white"
                  >
                    <Cpu size={12} /> CPU
                    <ArrowUpDown size={12} className={sortField === 'cpu' ? 'text-blue-400' : ''} />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button
                    onClick={() => handleSort('memory')}
                    className="flex items-center gap-1 text-xs font-medium text-gray-400 uppercase tracking-wider hover:text-white"
                  >
                    <MemoryStick size={12} /> Memory
                    <ArrowUpDown size={12} className={sortField === 'memory' ? 'text-blue-400' : ''} />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button
                    onClick={() => handleSort('disk')}
                    className="flex items-center gap-1 text-xs font-medium text-gray-400 uppercase tracking-wider hover:text-white"
                  >
                    <HardDrive size={12} /> Disk
                    <ArrowUpDown size={12} className={sortField === 'disk' ? 'text-blue-400' : ''} />
                  </button>
                </th>
                <th className="px-4 py-3 text-left hidden lg:table-cell">
                  <button
                    onClick={() => handleSort('load')}
                    className="flex items-center gap-1 text-xs font-medium text-gray-400 uppercase tracking-wider hover:text-white"
                  >
                    Load
                    <ArrowUpDown size={12} className={sortField === 'load' ? 'text-blue-400' : ''} />
                  </button>
                </th>
                <th className="px-4 py-3 text-left hidden xl:table-cell">
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Network</span>
                </th>
                <th className="px-4 py-3 text-left hidden xl:table-cell">
                  <button
                    onClick={() => handleSort('uptime')}
                    className="flex items-center gap-1 text-xs font-medium text-gray-400 uppercase tracking-wider hover:text-white"
                  >
                    Uptime
                    <ArrowUpDown size={12} className={sortField === 'uptime' ? 'text-blue-400' : ''} />
                  </button>
                </th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {isLoading && hosts.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                    Loading hosts...
                  </td>
                </tr>
              ) : filteredAndSortedHosts.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                    No hosts found
                  </td>
                </tr>
              ) : (
                filteredAndSortedHosts.map(host => (
                  <>
                    <tr
                      key={host.instance}
                      className={`hover:bg-gray-800/50 transition-colors ${expandedHost === host.instance ? 'bg-gray-800/30' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedHosts.has(host.instance)}
                          onChange={() => handleSelectHost(host.instance)}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Server size={16} className="text-gray-500" />
                          <div>
                            <div className="font-medium text-white">{host.hostname}</div>
                            <div className="text-xs text-gray-500">{host.instance}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {getStatusIcon(host.status)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16">
                            <div className={`text-sm font-mono ${getMetricColor(host.cpu_usage_percent, THRESHOLDS.cpu)}`}>
                              {host.cpu_usage_percent?.toFixed(1) ?? 'N/A'}%
                            </div>
                            <div className="h-1 bg-gray-700 rounded-full overflow-hidden mt-1">
                              <div
                                className={`h-full ${getProgressColor(host.cpu_usage_percent, THRESHOLDS.cpu)} transition-all`}
                                style={{ width: `${Math.min(host.cpu_usage_percent ?? 0, 100)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="w-16">
                          <div className={`text-sm font-mono ${getMetricColor(host.memory_usage_percent, THRESHOLDS.memory)}`}>
                            {host.memory_usage_percent?.toFixed(1) ?? 'N/A'}%
                          </div>
                          <div className="h-1 bg-gray-700 rounded-full overflow-hidden mt-1">
                            <div
                              className={`h-full ${getProgressColor(host.memory_usage_percent, THRESHOLDS.memory)} transition-all`}
                              style={{ width: `${Math.min(host.memory_usage_percent ?? 0, 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="w-16">
                          <div className={`text-sm font-mono ${getMetricColor(host.disk_usage_percent, THRESHOLDS.disk)}`}>
                            {host.disk_usage_percent?.toFixed(1) ?? 'N/A'}%
                          </div>
                          <div className="h-1 bg-gray-700 rounded-full overflow-hidden mt-1">
                            <div
                              className={`h-full ${getProgressColor(host.disk_usage_percent, THRESHOLDS.disk)} transition-all`}
                              style={{ width: `${Math.min(host.disk_usage_percent ?? 0, 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className={`text-sm font-mono ${getMetricColor(host.load_average_1m, THRESHOLDS.load)}`}>
                          {host.load_average_1m?.toFixed(2) ?? 'N/A'}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell">
                        <div className="text-xs space-y-0.5">
                          <div className="flex items-center gap-1">
                            <span className="text-green-400">↓</span>
                            <span className="text-gray-400 font-mono">{formatBytesPerSec(host.network_rx_bytes_per_sec)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-blue-400">↑</span>
                            <span className="text-gray-400 font-mono">{formatBytesPerSec(host.network_tx_bytes_per_sec)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell">
                        <span className="text-sm text-gray-400 font-mono">
                          {formatUptime(host.uptime_seconds)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleExpandHost(host.instance)}
                          className="p-1 text-gray-500 hover:text-white hover:bg-gray-700 rounded transition-colors"
                        >
                          {expandedHost === host.instance ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </td>
                    </tr>
                    {expandedHost === host.instance && detailedMetrics && (
                      <tr key={`${host.instance}-details`}>
                        <td colSpan={10} className="px-4 py-4 bg-gray-800/30 border-t border-gray-800">
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                            <MetricCard
                              icon={Cpu}
                              title="CPU Usage"
                              value={detailedMetrics.cpu_usage_percent}
                              format={(v) => `${v.toFixed(1)}%`}
                              thresholds={THRESHOLDS.cpu}
                              showProgress
                            />
                            <MetricCard
                              icon={MemoryStick}
                              title="Memory"
                              value={detailedMetrics.memory_usage_percent}
                              format={(v) => `${v.toFixed(1)}%`}
                              subtitle={`${formatBytes(detailedMetrics.memory_used_bytes ?? null)} / ${formatBytes(detailedMetrics.memory_total_bytes ?? null)}`}
                              thresholds={THRESHOLDS.memory}
                              showProgress
                            />
                            <MetricCard
                              icon={HardDrive}
                              title="Disk"
                              value={detailedMetrics.disk_usage_percent}
                              format={(v) => `${v.toFixed(1)}%`}
                              subtitle={`${formatBytes(detailedMetrics.disk_used_bytes ?? null)} / ${formatBytes(detailedMetrics.disk_total_bytes ?? null)}`}
                              thresholds={THRESHOLDS.disk}
                              showProgress
                            />
                            <div className="bg-gray-800 rounded-lg p-3">
                              <div className="flex items-center gap-2 text-gray-400 mb-2">
                                <Network size={14} />
                                <span className="text-xs">Network I/O</span>
                              </div>
                              <div className="space-y-1 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-gray-500">RX:</span>
                                  <span className="text-green-400 font-mono">{formatBytesPerSec(detailedMetrics.network_rx_bytes_per_sec ?? null)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">TX:</span>
                                  <span className="text-blue-400 font-mono">{formatBytesPerSec(detailedMetrics.network_tx_bytes_per_sec ?? null)}</span>
                                </div>
                              </div>
                            </div>
                            <div className="bg-gray-800 rounded-lg p-3">
                              <div className="flex items-center gap-2 text-gray-400 mb-2">
                                <Activity size={14} />
                                <span className="text-xs">Load Average</span>
                              </div>
                              <div className="flex gap-2 text-sm font-mono">
                                <span className="text-white">{detailedMetrics.load_average_1m?.toFixed(2) ?? 'N/A'}</span>
                                <span className="text-gray-400">{detailedMetrics.load_average_5m?.toFixed(2) ?? 'N/A'}</span>
                                <span className="text-gray-500">{detailedMetrics.load_average_15m?.toFixed(2) ?? 'N/A'}</span>
                              </div>
                              <div className="flex gap-2 text-[10px] text-gray-600 mt-0.5">
                                <span>1m</span>
                                <span>5m</span>
                                <span>15m</span>
                              </div>
                            </div>
                            <div className="bg-gray-800 rounded-lg p-3">
                              <div className="flex items-center gap-2 text-gray-400 mb-2">
                                <Clock size={14} />
                                <span className="text-xs">Uptime</span>
                              </div>
                              <div className="text-lg font-mono text-white">
                                {formatUptime(detailedMetrics.uptime_seconds ?? null)}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
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
        <Icon size={14} />
        <span className="text-xs">{title}</span>
      </div>
      <div className={`text-xl font-mono ${getColor(value)}`}>
        {value !== null ? format(value) : 'N/A'}
      </div>
      {subtitle && <div className="text-[10px] text-gray-500 mt-0.5">{subtitle}</div>}
      {showProgress && value !== null && (
        <div className="mt-2 h-1 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full ${getProgressColor(value)} transition-all duration-300`}
            style={{ width: `${Math.min(value, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
