import { useState, useEffect } from 'react';
import { networkApi } from '../services/api';
import type {
  NetworkStatus,
  BGPSummary,
  BGPEvent,
  TrafficSummary,
  DailyTrafficSummary,
  ObserviumAlert,
  TrafficGraphData,
} from '../types';
import {
  Network,
  Globe,
  Activity,
  AlertTriangle,
  RefreshCw,
  ArrowUpDown,
  Server,
  TrendingUp,
  TrendingDown,
  Clock,
  Wifi,
  WifiOff,
  Route,
  BarChart3,
  Calendar,
} from 'lucide-react';

export default function NetworkPage() {
  const [status, setStatus] = useState<NetworkStatus | null>(null);
  const [bgpSummary, setBgpSummary] = useState<BGPSummary | null>(null);
  const [bgpEvents, setBgpEvents] = useState<BGPEvent[]>([]);
  const [trafficSummary, setTrafficSummary] = useState<TrafficSummary | null>(null);
  const [dailyTraffic, setDailyTraffic] = useState<DailyTrafficSummary[]>([]);
  const [alerts, setAlerts] = useState<ObserviumAlert[]>([]);
  const [trafficGraphData, setTrafficGraphData] = useState<TrafficGraphData[]>([]);
  const [selectedInterface, setSelectedInterface] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState(24); // hours
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'bgp' | 'traffic' | 'alerts'>('overview');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [timeRange]);

  useEffect(() => {
    if (selectedInterface) {
      loadTrafficGraph(selectedInterface);
    }
  }, [selectedInterface, timeRange]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [statusData, bgpData, eventsData, trafficData, alertsData] = await Promise.all([
        networkApi.getStatus(),
        networkApi.getBGPSummary().catch(() => null),
        networkApi.getBGPEvents(timeRange).catch(() => []),
        networkApi.getTrafficSummary().catch(() => null),
        networkApi.getAlerts(timeRange).catch(() => []),
      ]);

      setStatus(statusData);
      setBgpSummary(bgpData);
      setBgpEvents(eventsData);
      setTrafficSummary(trafficData);
      setAlerts(alertsData);

      // Load daily traffic for first interface if available
      if (trafficData?.monitoring_interfaces?.length && !selectedInterface) {
        const firstInterface = trafficData.monitoring_interfaces[0];
        setSelectedInterface(firstInterface);
        const daily = await networkApi.getDailyTraffic(firstInterface, 30).catch(() => []);
        setDailyTraffic(daily);
      }
    } catch (err) {
      console.error('Failed to load network data:', err);
      setError('Failed to load network data');
    } finally {
      setIsLoading(false);
    }
  };

  const loadTrafficGraph = async (interfaceName: string) => {
    try {
      const graphData = await networkApi.getTrafficGraphData(interfaceName, timeRange);
      setTrafficGraphData(graphData.data || []);
      const daily = await networkApi.getDailyTraffic(interfaceName, 30);
      setDailyTraffic(daily);
    } catch (err) {
      console.error('Failed to load traffic graph:', err);
    }
  };

  const formatBytes = (bytes: number, decimals = 2): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
  };

  const formatBitsPerSec = (bps: number): string => {
    if (bps === 0) return '0 bps';
    const k = 1000;
    const sizes = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps'];
    const i = Math.floor(Math.log(bps) / Math.log(k));
    return `${parseFloat((bps / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const getSeverityColor = (severity: string | null): string => {
    switch (severity?.toLowerCase()) {
      case 'critical': return 'text-red-400 bg-red-500/20';
      case 'warning': return 'text-amber-400 bg-amber-500/20';
      case 'info': return 'text-blue-400 bg-blue-500/20';
      default: return 'text-gray-400 bg-gray-500/20';
    }
  };

  if (error && !status) {
    return (
      <div className="p-6">
        <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg">
          {error}
        </div>
      </div>
    );
  }

  // Calculate today's total traffic
  const todayTraffic = dailyTraffic.find(d => {
    const today = new Date().toISOString().split('T')[0];
    return d.date.startsWith(today);
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <Network size={24} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Network</h1>
            <p className="text-sm text-gray-500">BGP visibility and traffic monitoring</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(Number(e.target.value))}
            className="px-3 py-2 bg-gray-800 text-gray-300 border border-gray-700 rounded-lg text-sm"
          >
            <option value={1}>Last 1 hour</option>
            <option value={6}>Last 6 hours</option>
            <option value={24}>Last 24 hours</option>
            <option value={48}>Last 48 hours</option>
            <option value={168}>Last 7 days</option>
          </select>
          <button
            onClick={loadData}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatusCard
          icon={Globe}
          label="AS Number"
          value={status?.asn ? `AS${status.asn}` : 'Not configured'}
          sublabel={status?.cloudflare_radar_available ? 'Cloudflare Radar connected' : 'Radar unavailable'}
          color={status?.cloudflare_radar_available ? 'blue' : 'gray'}
        />
        <StatusCard
          icon={Route}
          label="BGP Prefixes"
          value={bgpSummary?.prefix_count?.toString() || '0'}
          sublabel={`${bgpSummary?.recent_events_24h || 0} events (24h)`}
          color="green"
        />
        <StatusCard
          icon={Activity}
          label="Today's Traffic"
          value={todayTraffic ? formatBytes(todayTraffic.total_in_bytes + todayTraffic.total_out_bytes) : '0 B'}
          sublabel={selectedInterface || 'No interface selected'}
          color="purple"
        />
        <StatusCard
          icon={Server}
          label="Observium"
          value={status?.observium_available ? 'Connected' : 'Unavailable'}
          sublabel={`${status?.monitored_interfaces.length || 0} interfaces monitored`}
          color={status?.observium_available ? 'green' : 'gray'}
        />
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-gray-800 pb-2">
        <TabButton
          active={activeTab === 'overview'}
          onClick={() => setActiveTab('overview')}
          icon={BarChart3}
          label="Overview"
        />
        <TabButton
          active={activeTab === 'bgp'}
          onClick={() => setActiveTab('bgp')}
          icon={Route}
          label="BGP Status"
        />
        <TabButton
          active={activeTab === 'traffic'}
          onClick={() => setActiveTab('traffic')}
          icon={Activity}
          label="Traffic"
        />
        <TabButton
          active={activeTab === 'alerts'}
          onClick={() => setActiveTab('alerts')}
          icon={AlertTriangle}
          label={`Alerts ${alerts.length > 0 ? `(${alerts.length})` : ''}`}
        />
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Daily Traffic Total - Prominent */}
          {todayTraffic && (
            <div className="bg-gradient-to-r from-blue-900/50 to-purple-900/50 rounded-xl border border-blue-800 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Calendar size={20} className="text-blue-400" />
                    Today's Traffic Total
                  </h3>
                  <p className="text-sm text-gray-400 mt-1">{new Date().toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-4xl font-bold text-white">
                    {formatBytes(todayTraffic.total_in_bytes + todayTraffic.total_out_bytes)}
                  </p>
                  <div className="flex gap-4 mt-2 text-sm">
                    <span className="text-green-400 flex items-center gap-1">
                      <TrendingDown size={14} /> In: {formatBytes(todayTraffic.total_in_bytes)}
                    </span>
                    <span className="text-blue-400 flex items-center gap-1">
                      <TrendingUp size={14} /> Out: {formatBytes(todayTraffic.total_out_bytes)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* WAN Interface Summary */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Activity size={20} className="text-green-400" />
                WAN Interface Throughput
              </h3>
              {trafficSummary?.interfaces.length === 0 ? (
                <p className="text-gray-500 text-sm">No interfaces configured</p>
              ) : (
                <div className="space-y-4">
                  {trafficSummary?.interfaces.map((iface) => (
                    <div
                      key={iface.interface_name}
                      className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                        selectedInterface === iface.interface_name
                          ? 'bg-blue-900/30 border-blue-700'
                          : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                      }`}
                      onClick={() => setSelectedInterface(iface.interface_name)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-white">{iface.interface_name}</span>
                        {iface.ifOperStatus === 'up' ? (
                          <Wifi size={16} className="text-green-400" />
                        ) : (
                          <WifiOff size={16} className="text-red-400" />
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">In:</span>
                          <span className="text-green-400 ml-2">
                            {formatBitsPerSec((iface.ifInOctets_rate || 0) * 8)}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Out:</span>
                          <span className="text-blue-400 ml-2">
                            {formatBitsPerSec((iface.ifOutOctets_rate || 0) * 8)}
                          </span>
                        </div>
                      </div>
                      {iface.ifSpeed && (
                        <div className="mt-2 text-xs text-gray-500">
                          Speed: {formatBitsPerSec(iface.ifSpeed)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* BGP Status Overview */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Globe size={20} className="text-blue-400" />
                BGP Status Overview
              </h3>
              {!bgpSummary ? (
                <p className="text-gray-500 text-sm">BGP monitoring not configured</p>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-gray-800/50 rounded-lg">
                      <p className="text-2xl font-bold text-white">{bgpSummary.prefix_count}</p>
                      <p className="text-sm text-gray-500">Active Prefixes</p>
                    </div>
                    <div className="p-3 bg-gray-800/50 rounded-lg">
                      <p className="text-2xl font-bold text-white">{bgpSummary.recent_events_24h}</p>
                      <p className="text-sm text-gray-500">Events (24h)</p>
                    </div>
                  </div>

                  {/* Event Counts */}
                  {Object.keys(bgpSummary.event_counts).length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm text-gray-400">Event Types (24h)</p>
                      {Object.entries(bgpSummary.event_counts).map(([type, count]) => (
                        <div key={type} className="flex items-center justify-between text-sm">
                          <span className="text-gray-400 capitalize">{type.replace(/_/g, ' ')}</span>
                          <span className={`px-2 py-0.5 rounded ${
                            type.includes('hijack') ? 'bg-red-500/20 text-red-400' :
                            type.includes('leak') ? 'bg-amber-500/20 text-amber-400' :
                            'bg-gray-500/20 text-gray-400'
                          }`}>
                            {count}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Announced Prefixes */}
                  {bgpSummary.prefixes.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm text-gray-400">Announced Prefixes</p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {bgpSummary.prefixes.map((p) => (
                          <div key={p.prefix} className="flex items-center justify-between text-sm">
                            <code className="text-white font-mono">{p.prefix}</code>
                            {p.is_visible ? (
                              <span className="text-green-400 text-xs">visible</span>
                            ) : (
                              <span className="text-red-400 text-xs">not visible</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Recent BGP Events */}
          {bgpEvents.length > 0 && (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Clock size={20} className="text-amber-400" />
                Recent Routing Events
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {bgpEvents.slice(0, 10).map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center gap-4 p-3 bg-gray-800/50 rounded-lg"
                  >
                    <span className={`px-2 py-1 text-xs rounded ${getSeverityColor(event.severity)}`}>
                      {event.severity || 'info'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm">
                        {event.event_type.replace(/_/g, ' ')}
                        {event.prefix && (
                          <code className="ml-2 text-blue-400">{event.prefix}</code>
                        )}
                      </p>
                      {event.description && (
                        <p className="text-gray-500 text-xs truncate">{event.description}</p>
                      )}
                    </div>
                    <span className="text-gray-500 text-xs whitespace-nowrap">
                      {new Date(event.event_time).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'bgp' && (
        <div className="space-y-6">
          {/* BGP Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <p className="text-gray-500 text-sm">AS Number</p>
              <p className="text-3xl font-bold text-white mt-1">
                {status?.asn ? `AS${status.asn}` : 'N/A'}
              </p>
            </div>
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <p className="text-gray-500 text-sm">Announced Prefixes</p>
              <p className="text-3xl font-bold text-white mt-1">
                {bgpSummary?.prefix_count || 0}
              </p>
            </div>
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <p className="text-gray-500 text-sm">API Status</p>
              <p className="text-3xl font-bold text-white mt-1">
                {status?.cloudflare_radar_available ? (
                  <span className="text-green-400">Connected</span>
                ) : (
                  <span className="text-red-400">Disconnected</span>
                )}
              </p>
            </div>
          </div>

          {/* Prefix List */}
          {bgpSummary && bgpSummary.prefixes.length > 0 && (
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800">
                <h3 className="text-lg font-semibold text-white">Prefix Status</h3>
              </div>
              <div className="divide-y divide-gray-800">
                {bgpSummary.prefixes.map((prefix) => (
                  <div key={prefix.prefix} className="px-4 py-3 flex items-center gap-4">
                    <code className="text-white font-mono flex-1">{prefix.prefix}</code>
                    <span className={`px-2 py-1 text-xs rounded ${
                      prefix.is_visible
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                      {prefix.is_visible ? 'Visible' : 'Not Visible'}
                    </span>
                    <span className="text-gray-500 text-sm">
                      {prefix.last_seen && `Last seen: ${new Date(prefix.last_seen).toLocaleString()}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* BGP Events */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800">
              <h3 className="text-lg font-semibold text-white">BGP Events</h3>
            </div>
            {bgpEvents.length === 0 ? (
              <div className="p-8 text-center">
                <Route size={48} className="mx-auto mb-4 text-gray-600" />
                <h4 className="text-lg font-medium text-gray-400 mb-2">No BGP Events</h4>
                <p className="text-gray-500 text-sm">
                  No routing events detected in the selected time period.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-800 max-h-96 overflow-y-auto">
                {bgpEvents.map((event) => (
                  <div key={event.id} className="px-4 py-3">
                    <div className="flex items-center gap-4">
                      <span className={`px-2 py-1 text-xs rounded ${getSeverityColor(event.severity)}`}>
                        {event.severity || 'info'}
                      </span>
                      <div className="flex-1">
                        <p className="text-white">
                          {event.event_type.replace(/_/g, ' ')}
                          {event.prefix && (
                            <code className="ml-2 text-blue-400">{event.prefix}</code>
                          )}
                        </p>
                        {event.description && (
                          <p className="text-gray-500 text-sm mt-1">{event.description}</p>
                        )}
                      </div>
                      <span className="text-gray-500 text-sm">
                        {new Date(event.event_time).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'traffic' && (
        <div className="space-y-6">
          {/* Interface Selector */}
          {trafficSummary && trafficSummary.monitoring_interfaces.length > 0 && (
            <div className="flex gap-2">
              {trafficSummary.monitoring_interfaces.map((iface) => (
                <button
                  key={iface}
                  onClick={() => setSelectedInterface(iface)}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    selectedInterface === iface
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {iface}
                </button>
              ))}
            </div>
          )}

          {/* Current Traffic Stats */}
          {selectedInterface && trafficSummary && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              {trafficSummary.interfaces
                .filter((i) => i.interface_name === selectedInterface)
                .map((iface) => (
                  <>
                    <div key={`${iface.interface_name}-in`} className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                      <div className="flex items-center gap-2 text-green-400 mb-2">
                        <TrendingDown size={20} />
                        <span className="text-sm">Inbound</span>
                      </div>
                      <p className="text-2xl font-bold text-white">
                        {formatBitsPerSec((iface.ifInOctets_rate || 0) * 8)}
                      </p>
                    </div>
                    <div key={`${iface.interface_name}-out`} className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                      <div className="flex items-center gap-2 text-blue-400 mb-2">
                        <TrendingUp size={20} />
                        <span className="text-sm">Outbound</span>
                      </div>
                      <p className="text-2xl font-bold text-white">
                        {formatBitsPerSec((iface.ifOutOctets_rate || 0) * 8)}
                      </p>
                    </div>
                    <div key={`${iface.interface_name}-speed`} className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                      <div className="flex items-center gap-2 text-gray-400 mb-2">
                        <ArrowUpDown size={20} />
                        <span className="text-sm">Interface Speed</span>
                      </div>
                      <p className="text-2xl font-bold text-white">
                        {formatBitsPerSec(iface.ifSpeed || 0)}
                      </p>
                    </div>
                    <div key={`${iface.interface_name}-status`} className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                      <div className="flex items-center gap-2 text-gray-400 mb-2">
                        {iface.ifOperStatus === 'up' ? (
                          <Wifi size={20} className="text-green-400" />
                        ) : (
                          <WifiOff size={20} className="text-red-400" />
                        )}
                        <span className="text-sm">Status</span>
                      </div>
                      <p className="text-2xl font-bold text-white capitalize">
                        {iface.ifOperStatus || 'Unknown'}
                      </p>
                    </div>
                  </>
                ))}
            </div>
          )}

          {/* Daily Traffic Summary Table */}
          {dailyTraffic.length > 0 && (
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800">
                <h3 className="text-lg font-semibold text-white">Daily Traffic ({selectedInterface})</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-gray-500 text-sm border-b border-gray-800">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Total In</th>
                      <th className="px-4 py-3">Total Out</th>
                      <th className="px-4 py-3">Total</th>
                      <th className="px-4 py-3">Peak In</th>
                      <th className="px-4 py-3">Peak Out</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {dailyTraffic.slice().reverse().map((day) => (
                      <tr key={day.date} className="hover:bg-gray-800/50">
                        <td className="px-4 py-3 text-white">
                          {new Date(day.date).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-green-400">{formatBytes(day.total_in_bytes)}</td>
                        <td className="px-4 py-3 text-blue-400">{formatBytes(day.total_out_bytes)}</td>
                        <td className="px-4 py-3 text-white font-medium">
                          {formatBytes(day.total_in_bytes + day.total_out_bytes)}
                        </td>
                        <td className="px-4 py-3 text-gray-400">
                          {day.peak_in ? formatBitsPerSec(day.peak_in * 8) : '-'}
                        </td>
                        <td className="px-4 py-3 text-gray-400">
                          {day.peak_out ? formatBitsPerSec(day.peak_out * 8) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'alerts' && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <h3 className="text-lg font-semibold text-white">Observium Alerts</h3>
          </div>
          {alerts.length === 0 ? (
            <div className="p-8 text-center">
              <AlertTriangle size={48} className="mx-auto mb-4 text-gray-600" />
              <h4 className="text-lg font-medium text-gray-400 mb-2">No Alerts</h4>
              <p className="text-gray-500 text-sm">
                No alerts in the selected time period.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-800">
              {alerts.map((alert) => (
                <div key={alert.id} className="px-4 py-3">
                  <div className="flex items-center gap-4">
                    <span className={`px-2 py-1 text-xs rounded ${getSeverityColor(alert.severity)}`}>
                      {alert.severity || 'info'}
                    </span>
                    <div className="flex-1">
                      <p className="text-white">
                        {alert.device_hostname && (
                          <span className="text-blue-400 mr-2">{alert.device_hostname}</span>
                        )}
                        {alert.entity_name || alert.entity_type || 'Unknown entity'}
                      </p>
                      {alert.message && (
                        <p className="text-gray-500 text-sm mt-1">{alert.message}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className={`px-2 py-1 text-xs rounded ${
                        alert.alert_status === 'active'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-green-500/20 text-green-400'
                      }`}>
                        {alert.alert_status}
                      </span>
                      <p className="text-gray-500 text-xs mt-1">
                        {new Date(alert.alert_time).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusCard({
  icon: Icon,
  label,
  value,
  sublabel,
  color,
}: {
  icon: typeof Network;
  label: string;
  value: string;
  sublabel: string;
  color: 'blue' | 'green' | 'amber' | 'purple' | 'gray';
}) {
  const colorClasses = {
    blue: 'text-blue-400 bg-blue-400/10',
    green: 'text-green-400 bg-green-400/10',
    amber: 'text-amber-400 bg-amber-400/10',
    purple: 'text-purple-400 bg-purple-400/10',
    gray: 'text-gray-400 bg-gray-400/10',
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          <Icon size={24} />
        </div>
        <div>
          <p className="text-2xl font-bold text-white">{value}</p>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-xs text-gray-600">{sublabel}</p>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Network;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : 'text-gray-400 hover:bg-gray-800 hover:text-white'
      }`}
    >
      <Icon size={18} />
      {label}
    </button>
  );
}
