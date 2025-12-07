import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { monitoringApi, serviceChecksApi } from '../services/api';
import type { MonitoringStatus, ThreatSummary, MapPoint, MonitoringAgent, ServiceCheckSummary } from '../types';
import ThreatMap from '../components/monitoring/ThreatMap';
import HostMetrics from '../components/monitoring/HostMetrics';
import {
  Shield,
  Server,
  AlertTriangle,
  Globe,
  Activity,
  Radio,
  RefreshCw,
  ChevronRight,
  Wifi,
  WifiOff,
  CheckCircle,
  XCircle,
} from 'lucide-react';

export default function MonitoringPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<MonitoringStatus | null>(null);
  const [summary, setSummary] = useState<ThreatSummary | null>(null);
  const [mapPoints, setMapPoints] = useState<MapPoint[]>([]);
  const [agents, setAgents] = useState<MonitoringAgent[]>([]);
  const [serviceCheckSummary, setServiceCheckSummary] = useState<ServiceCheckSummary | null>(null);
  const [timeWindow, setTimeWindow] = useState(60); // minutes
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'threats' | 'hosts' | 'agents'>('threats');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [timeWindow]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [statusData, summaryData, mapData, agentsData, serviceCheckData] = await Promise.all([
        monitoringApi.getStatus(),
        monitoringApi.getThreatSummary(Math.ceil(timeWindow / 60)),
        monitoringApi.getMapData(timeWindow),
        monitoringApi.getAgents(),
        serviceChecksApi.getSummary().catch(() => null),
      ]);

      setStatus(statusData);
      setSummary(summaryData);
      setMapPoints(mapData);
      setAgents(agentsData);
      setServiceCheckSummary(serviceCheckData);
    } catch (err) {
      console.error('Failed to load monitoring data:', err);
      setError('Failed to load monitoring data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTimeWindowChange = (minutes: number) => {
    setTimeWindow(minutes);
  };

  const getAgentStatusIcon = (agentStatus: string) => {
    switch (agentStatus) {
      case 'online': return <Wifi size={14} className="text-green-400" />;
      case 'stale': return <Radio size={14} className="text-amber-400 animate-pulse" />;
      case 'offline': return <WifiOff size={14} className="text-red-400" />;
      default: return <Radio size={14} className="text-gray-400" />;
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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-500/10 rounded-lg">
            <Shield size={24} className="text-red-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Monitoring</h1>
            <p className="text-sm text-gray-500">Threat detection and system metrics</p>
          </div>
        </div>
        <button
          onClick={loadData}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
        >
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatusCard
          icon={AlertTriangle}
          label="Blocked Attacks"
          value={summary?.total_events.toLocaleString() || '0'}
          sublabel={`Last ${timeWindow >= 60 ? `${Math.floor(timeWindow / 60)}h` : `${timeWindow}m`}`}
          color="red"
        />
        <StatusCard
          icon={Globe}
          label="Unique Sources"
          value={summary?.unique_ips.toLocaleString() || '0'}
          sublabel="Distinct IPs"
          color="amber"
        />
        <StatusCard
          icon={Server}
          label="Active Agents"
          value={`${status?.connected_agents || 0}/${status?.total_agents || 0}`}
          sublabel="Connected / Total"
          color="green"
        />
        {/* Service Checks Summary */}
        <div
          onClick={() => navigate('/service-checks')}
          className="bg-gray-900 rounded-xl border border-gray-800 p-4 cursor-pointer hover:border-gray-700 transition-colors"
        >
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${
              serviceCheckSummary?.failing
                ? 'bg-red-400/10 text-red-400'
                : 'bg-green-400/10 text-green-400'
            }`}>
              {serviceCheckSummary?.failing ? <XCircle size={20} /> : <CheckCircle size={20} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-2xl font-bold text-white">
                {serviceCheckSummary
                  ? `${serviceCheckSummary.passing}/${serviceCheckSummary.total}`
                  : '—'}
              </p>
              <p className="text-sm text-gray-500">Service Checks</p>
              {serviceCheckSummary?.failing ? (
                <p className="text-xs text-red-400 mt-1">{serviceCheckSummary.failing} failing</p>
              ) : (
                <p className="text-xs text-green-400 mt-1">All passing</p>
              )}
            </div>
            <ChevronRight size={16} className="text-gray-600" />
          </div>
        </div>
        <StatusCard
          icon={Activity}
          label="Prometheus"
          value={status?.prometheus_available ? 'Connected' : 'Unavailable'}
          sublabel={status?.prometheus_available ? 'Metrics available' : 'Configure in settings'}
          color={status?.prometheus_available ? 'blue' : 'gray'}
        />
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-gray-800 pb-2">
        <TabButton
          active={activeTab === 'threats'}
          onClick={() => setActiveTab('threats')}
          icon={Shield}
          label="Threat Map"
        />
        <TabButton
          active={activeTab === 'hosts'}
          onClick={() => setActiveTab('hosts')}
          icon={Server}
          label="Host Metrics"
        />
        <TabButton
          active={activeTab === 'agents'}
          onClick={() => setActiveTab('agents')}
          icon={Radio}
          label="Agents"
        />
      </div>

      {/* Tab Content */}
      {activeTab === 'threats' && (
        <div className="space-y-6">
          {/* Threat Map */}
          <ThreatMap
            points={mapPoints}
            isLoading={isLoading}
            timeWindow={timeWindow}
            onTimeWindowChange={handleTimeWindowChange}
          />

          {/* Stats Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Countries */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Globe size={20} className="text-red-400" />
                Top Attack Sources
              </h3>
              {summary?.top_countries.length === 0 ? (
                <p className="text-gray-500 text-sm">No data available</p>
              ) : (
                <div className="space-y-3">
                  {summary?.top_countries.slice(0, 5).map((country, idx) => (
                    <div key={country.code} className="flex items-center gap-3">
                      <span className="text-gray-500 w-6 text-right">{idx + 1}.</span>
                      <span className="text-sm text-gray-400 w-6">{country.code}</span>
                      <span className="flex-1 text-white">{country.name}</span>
                      <span className="text-red-400 font-mono">{country.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Targeted Ports */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <AlertTriangle size={20} className="text-amber-400" />
                Top Targeted Ports
              </h3>
              {summary?.top_ports.length === 0 ? (
                <p className="text-gray-500 text-sm">No data available</p>
              ) : (
                <div className="space-y-3">
                  {summary?.top_ports.slice(0, 5).map((port, idx) => (
                    <div key={port.port} className="flex items-center gap-3">
                      <span className="text-gray-500 w-6 text-right">{idx + 1}.</span>
                      <span className="text-white font-mono flex-1">{port.port}</span>
                      <span className="text-xs text-gray-500">{getPortName(port.port)}</span>
                      <span className="text-amber-400 font-mono">{port.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'hosts' && (
        <HostMetrics prometheusAvailable={status?.prometheus_available || false} />
      )}

      {activeTab === 'agents' && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Radio size={20} className="text-blue-400" />
              Monitoring Agents
            </h3>
          </div>
          {agents.length === 0 ? (
            <div className="p-8 text-center">
              <Radio size={48} className="mx-auto mb-4 text-gray-600" />
              <h4 className="text-lg font-medium text-gray-400 mb-2">No Agents Registered</h4>
              <p className="text-gray-500 text-sm max-w-md mx-auto">
                Deploy the monitoring agent on your servers to start collecting UFW logs and health checks.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-800">
              {agents.map(agent => (
                <div key={agent.id} className="px-4 py-3 hover:bg-gray-800/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="flex-shrink-0">
                      {getAgentStatusIcon(agent.status)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{agent.hostname}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          agent.status === 'online' ? 'bg-green-500/20 text-green-400' :
                          agent.status === 'stale' ? 'bg-amber-500/20 text-amber-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {agent.status}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500">
                        {agent.ip_address}
                        {agent.version && <span className="ml-2">v{agent.version}</span>}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="text-gray-400">Last seen</div>
                      <div className="text-gray-500">
                        {agent.last_seen
                          ? new Date(agent.last_seen).toLocaleString()
                          : 'Never'}
                      </div>
                    </div>
                    <ChevronRight size={20} className="text-gray-600" />
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
  icon: typeof Shield;
  label: string;
  value: string;
  sublabel: string;
  color: 'red' | 'amber' | 'green' | 'blue' | 'gray';
}) {
  const colorClasses = {
    red: 'text-red-400 bg-red-400/10',
    amber: 'text-amber-400 bg-amber-400/10',
    green: 'text-green-400 bg-green-400/10',
    blue: 'text-blue-400 bg-blue-400/10',
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
  icon: typeof Shield;
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

function getPortName(port: number): string {
  const commonPorts: Record<number, string> = {
    21: 'FTP',
    22: 'SSH',
    23: 'Telnet',
    25: 'SMTP',
    53: 'DNS',
    80: 'HTTP',
    110: 'POP3',
    143: 'IMAP',
    443: 'HTTPS',
    445: 'SMB',
    993: 'IMAPS',
    995: 'POP3S',
    1433: 'MSSQL',
    1521: 'Oracle',
    3306: 'MySQL',
    3389: 'RDP',
    5432: 'PostgreSQL',
    5900: 'VNC',
    6379: 'Redis',
    8080: 'HTTP Alt',
    8443: 'HTTPS Alt',
    27017: 'MongoDB',
  };
  return commonPorts[port] || '';
}
