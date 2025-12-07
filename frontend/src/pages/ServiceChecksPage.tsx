import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { serviceChecksApi } from '../services/api';
import type {
  ServiceCheck,
  ServiceCheckSummary,
  ServiceCheckCreate,
  ServiceCheckUpdate,
  AvailableAgent,
  CheckTypeInfo,
  ServiceCheckResult,
  DailyUptime,
  UptimeStats,
} from '../types';
import {
  Activity,
  Plus,
  RefreshCw,
  CheckCircle,
  XCircle,
  HelpCircle,
  Clock,
  Globe,
  Server,
  Trash2,
  Edit,
  Play,
  Pause,
  ExternalLink,
  ArrowLeft,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';

// Main page component
export default function ServiceChecksPage() {
  const { checkId } = useParams();

  if (checkId) {
    return <CheckDetailView checkId={parseInt(checkId)} />;
  }

  return <CheckListView />;
}

// Check list view
function CheckListView() {
  const navigate = useNavigate();
  const [checks, setChecks] = useState<ServiceCheck[]>([]);
  const [summary, setSummary] = useState<ServiceCheckSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingCheck, setEditingCheck] = useState<ServiceCheck | null>(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [checksData, summaryData] = await Promise.all([
        serviceChecksApi.getAll(true),
        serviceChecksApi.getSummary(),
      ]);
      setChecks(checksData);
      setSummary(summaryData);
      setError(null);
    } catch (err) {
      setError('Failed to load service checks');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleEnabled = async (check: ServiceCheck) => {
    try {
      if (check.is_enabled) {
        await serviceChecksApi.disable(check.id);
      } else {
        await serviceChecksApi.enable(check.id);
      }
      loadData();
    } catch (err) {
      console.error('Failed to toggle check:', err);
    }
  };

  const handleRunNow = async (check: ServiceCheck) => {
    try {
      await serviceChecksApi.runNow(check.id);
      // Show feedback
    } catch (err) {
      console.error('Failed to run check:', err);
    }
  };

  const handleDelete = async (check: ServiceCheck) => {
    if (!confirm(`Are you sure you want to delete "${check.name}"?`)) {
      return;
    }
    try {
      await serviceChecksApi.delete(check.id);
      loadData();
    } catch (err) {
      console.error('Failed to delete check:', err);
    }
  };

  const handleSave = async (data: ServiceCheckCreate | ServiceCheckUpdate, checkId?: number) => {
    try {
      if (checkId) {
        await serviceChecksApi.update(checkId, data);
      } else {
        await serviceChecksApi.create(data as ServiceCheckCreate);
      }
      setShowModal(false);
      setEditingCheck(null);
      loadData();
    } catch (err) {
      console.error('Failed to save check:', err);
      throw err;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passing':
        return <CheckCircle size={18} className="text-green-400" />;
      case 'failing':
        return <XCircle size={18} className="text-red-400" />;
      default:
        return <HelpCircle size={18} className="text-gray-400" />;
    }
  };

  const getCheckTypeIcon = (type: string) => {
    switch (type) {
      case 'http':
      case 'http_proxy':
        return <Globe size={16} className="text-blue-400" />;
      case 'dns':
        return <Server size={16} className="text-purple-400" />;
      case 'file':
        return <ExternalLink size={16} className="text-amber-400" />;
      default:
        return <Activity size={16} className="text-gray-400" />;
    }
  };

  if (error && !checks.length) {
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
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <Activity size={24} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Service Checks</h1>
            <p className="text-sm text-gray-500">Monitor HTTP, DNS, and file availability</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => {
              setEditingCheck(null);
              setShowModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            <Plus size={16} />
            Add Check
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <SummaryCard
            label="Total Checks"
            value={summary.total}
            color="blue"
          />
          <SummaryCard
            label="Passing"
            value={summary.passing}
            color="green"
            icon={<CheckCircle size={20} />}
          />
          <SummaryCard
            label="Failing"
            value={summary.failing}
            color="red"
            icon={<XCircle size={20} />}
          />
          <SummaryCard
            label="Unknown"
            value={summary.unknown}
            color="gray"
            icon={<HelpCircle size={20} />}
          />
        </div>
      )}

      {/* Checks List */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <h3 className="text-lg font-semibold text-white">All Checks</h3>
        </div>

        {checks.length === 0 ? (
          <div className="p-8 text-center">
            <Activity size={48} className="mx-auto mb-4 text-gray-600" />
            <h4 className="text-lg font-medium text-gray-400 mb-2">No Service Checks</h4>
            <p className="text-gray-500 text-sm max-w-md mx-auto mb-4">
              Create your first service check to start monitoring HTTP endpoints, DNS records, and file availability.
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
            >
              <Plus size={16} />
              Add Check
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {checks.map((check) => (
              <div
                key={check.id}
                className={`px-4 py-3 hover:bg-gray-800/50 transition-colors cursor-pointer ${
                  !check.is_enabled ? 'opacity-50' : ''
                }`}
                onClick={() => navigate(`/service-checks/${check.id}`)}
              >
                <div className="flex items-center gap-4">
                  {/* Status Icon */}
                  <div className="flex-shrink-0">
                    {getStatusIcon(check.current_status)}
                  </div>

                  {/* Check Type Icon */}
                  <div className="flex-shrink-0">
                    {getCheckTypeIcon(check.check_type)}
                  </div>

                  {/* Check Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{check.name}</span>
                      {!check.is_enabled && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">
                          Disabled
                        </span>
                      )}
                      {check.is_alerting && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 flex items-center gap-1">
                          <AlertTriangle size={12} />
                          Alerting
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500 truncate">
                      {check.target}
                    </div>
                  </div>

                  {/* Latency */}
                  <div className="text-right text-sm hidden md:block">
                    {check.last_latency_ms !== null && (
                      <>
                        <div className="text-white font-mono">
                          {check.last_latency_ms.toFixed(0)}ms
                        </div>
                        <div className="text-gray-500 text-xs">latency</div>
                      </>
                    )}
                  </div>

                  {/* Last Check Time */}
                  <div className="text-right text-sm hidden lg:block">
                    <div className="text-gray-400">
                      {check.last_check_time
                        ? new Date(check.last_check_time).toLocaleTimeString()
                        : 'Never'}
                    </div>
                    <div className="text-gray-500 text-xs">last check</div>
                  </div>

                  {/* Agent */}
                  <div className="text-right text-sm hidden xl:block">
                    <div className="text-gray-400">
                      {check.assigned_agent || 'Any'}
                    </div>
                    <div className="text-gray-500 text-xs">agent</div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleRunNow(check)}
                      className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                      title="Run now"
                    >
                      <Play size={16} />
                    </button>
                    <button
                      onClick={() => handleToggleEnabled(check)}
                      className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                      title={check.is_enabled ? 'Disable' : 'Enable'}
                    >
                      {check.is_enabled ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                    <button
                      onClick={() => {
                        setEditingCheck(check);
                        setShowModal(true);
                      }}
                      className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(check)}
                      className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <ChevronRight size={20} className="text-gray-600" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <CheckModal
          check={editingCheck}
          onClose={() => {
            setShowModal(false);
            setEditingCheck(null);
          }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

// Summary card component
function SummaryCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: 'blue' | 'green' | 'red' | 'gray';
  icon?: React.ReactNode;
}) {
  const colorClasses = {
    blue: 'text-blue-400 bg-blue-400/10',
    green: 'text-green-400 bg-green-400/10',
    red: 'text-red-400 bg-red-400/10',
    gray: 'text-gray-400 bg-gray-400/10',
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <div className="flex items-center gap-3">
        {icon && (
          <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
            {icon}
          </div>
        )}
        <div>
          <p className="text-2xl font-bold text-white">{value}</p>
          <p className="text-sm text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}

// Check detail view
function CheckDetailView({ checkId }: { checkId: number }) {
  const navigate = useNavigate();
  const [check, setCheck] = useState<ServiceCheck | null>(null);
  const [results, setResults] = useState<ServiceCheckResult[]>([]);
  const [history, setHistory] = useState<DailyUptime[]>([]);
  const [uptime, setUptime] = useState<Record<string, UptimeStats>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [checkId]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [checkData, resultsData, historyData, uptimeData] = await Promise.all([
        serviceChecksApi.get(checkId),
        serviceChecksApi.getResults(checkId, 50),
        serviceChecksApi.getHistory(checkId, 90),
        serviceChecksApi.getUptime(checkId),
      ]);
      setCheck(checkData);
      setResults(resultsData);
      setHistory(historyData);
      setUptime(uptimeData);
      setError(null);
    } catch (err) {
      setError('Failed to load check details');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  if (error && !check) {
    return (
      <div className="p-6">
        <button
          onClick={() => navigate('/service-checks')}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-4"
        >
          <ArrowLeft size={16} />
          Back to checks
        </button>
        <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg">
          {error}
        </div>
      </div>
    );
  }

  if (!check) {
    return (
      <div className="p-6 flex items-center justify-center">
        <RefreshCw size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'passing':
        return 'text-green-400 bg-green-400/10';
      case 'failing':
        return 'text-red-400 bg-red-400/10';
      default:
        return 'text-gray-400 bg-gray-400/10';
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/service-checks')}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">{check.name}</h1>
              <span className={`px-3 py-1 rounded-full text-sm ${getStatusColor(check.current_status)}`}>
                {check.current_status}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">{check.target}</p>
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

      {/* Uptime Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {['24h', '7d', '30d', '90d'].map((period) => (
          <div key={period} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <div className="text-gray-500 text-sm mb-1">{period} Uptime</div>
            <div className="text-2xl font-bold text-white">
              {uptime[period]?.uptime_pct !== null
                ? `${uptime[period]?.uptime_pct?.toFixed(2)}%`
                : 'N/A'}
            </div>
            <div className="text-gray-500 text-xs mt-1">
              {uptime[period]?.successful_checks || 0} / {uptime[period]?.total_checks || 0} checks
            </div>
          </div>
        ))}
      </div>

      {/* Uptime Grid (GitHub-style) */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <h3 className="text-lg font-semibold text-white mb-4">90-Day History</h3>
        <UptimeGrid history={history} />
      </div>

      {/* Recent Results */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <h3 className="text-lg font-semibold text-white">Recent Results</h3>
        </div>
        <div className="divide-y divide-gray-800 max-h-96 overflow-y-auto">
          {results.length === 0 ? (
            <div className="p-4 text-gray-500 text-center">No results yet</div>
          ) : (
            results.map((result) => (
              <div key={result.id} className="px-4 py-3">
                <div className="flex items-center gap-4">
                  {result.is_success ? (
                    <CheckCircle size={18} className="text-green-400" />
                  ) : (
                    <XCircle size={18} className="text-red-400" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white">
                      {result.is_success ? 'Check passed' : 'Check failed'}
                    </div>
                    {result.error_message && (
                      <div className="text-xs text-red-400 truncate">
                        {result.error_message}
                      </div>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">
                    {result.agent_hostname}
                  </div>
                  {result.latency_ms !== null && (
                    <div className="text-sm font-mono text-gray-400">
                      {result.latency_ms.toFixed(0)}ms
                    </div>
                  )}
                  <div className="text-sm text-gray-500">
                    {new Date(result.check_time).toLocaleString()}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Check Details */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <h3 className="text-lg font-semibold text-white mb-4">Configuration</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-gray-500">Type</div>
            <div className="text-white">{check.check_type}</div>
          </div>
          <div>
            <div className="text-gray-500">Interval</div>
            <div className="text-white">{check.interval_seconds}s</div>
          </div>
          <div>
            <div className="text-gray-500">Timeout</div>
            <div className="text-white">{check.timeout_seconds}s</div>
          </div>
          <div>
            <div className="text-gray-500">Agent</div>
            <div className="text-white">{check.assigned_agent || 'Any'}</div>
          </div>
          <div>
            <div className="text-gray-500">Failure Threshold</div>
            <div className="text-white">{check.failure_threshold} failures</div>
          </div>
          <div>
            <div className="text-gray-500">Alert Interval</div>
            <div className="text-white">{check.alert_interval_hours} hours</div>
          </div>
          {check.expected_status_code && (
            <div>
              <div className="text-gray-500">Expected Status</div>
              <div className="text-white">{check.expected_status_code}</div>
            </div>
          )}
          {check.expected_content && (
            <div>
              <div className="text-gray-500">Expected Content</div>
              <div className="text-white truncate">{check.expected_content}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// GitHub-style uptime grid
function UptimeGrid({ history }: { history: DailyUptime[] }) {
  // Create a map of dates to uptime percentages
  const uptimeMap = new Map<string, number | null>();
  history.forEach((h) => {
    uptimeMap.set(h.date, h.uptime_pct);
  });

  // Generate last 90 days
  const days: { date: string; uptime: number | null }[] = [];
  for (let i = 89; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    days.push({
      date: dateStr,
      uptime: uptimeMap.get(dateStr) ?? null,
    });
  }

  const getColor = (uptime: number | null) => {
    if (uptime === null) return 'bg-gray-700';
    if (uptime >= 99) return 'bg-green-500';
    if (uptime >= 95) return 'bg-green-600';
    if (uptime >= 90) return 'bg-yellow-500';
    if (uptime >= 80) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div className="flex flex-wrap gap-1">
      {days.map((day) => (
        <div
          key={day.date}
          className={`w-3 h-3 rounded-sm ${getColor(day.uptime)}`}
          title={`${day.date}: ${day.uptime !== null ? `${day.uptime.toFixed(1)}%` : 'No data'}`}
        />
      ))}
    </div>
  );
}

// Add/Edit check modal
function CheckModal({
  check,
  onClose,
  onSave,
}: {
  check: ServiceCheck | null;
  onClose: () => void;
  onSave: (data: ServiceCheckCreate | ServiceCheckUpdate, checkId?: number) => Promise<void>;
}) {
  const [checkTypes, setCheckTypes] = useState<CheckTypeInfo[]>([]);
  const [agents, setAgents] = useState<AvailableAgent[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: check?.name || '',
    description: check?.description || '',
    check_type: check?.check_type || 'http',
    target: check?.target || '',
    expected_status_code: check?.expected_status_code?.toString() || '',
    expected_content: check?.expected_content || '',
    proxy_address: check?.proxy_address || '',
    dns_server: check?.dns_server || '',
    expected_ip: check?.expected_ip || '',
    dns_record_type: check?.dns_record_type || 'A',
    timeout_seconds: check?.timeout_seconds?.toString() || '30',
    interval_seconds: check?.interval_seconds?.toString() || '300',
    failure_threshold: check?.failure_threshold?.toString() || '2',
    alert_interval_hours: check?.alert_interval_hours?.toString() || '6',
    assigned_agent: check?.assigned_agent || 'any',
  });

  useEffect(() => {
    Promise.all([
      serviceChecksApi.getTypes(),
      serviceChecksApi.getAvailableAgents(),
    ]).then(([typesData, agentsData]) => {
      setCheckTypes(typesData.types);
      setAgents(agentsData.agents);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const data: ServiceCheckCreate = {
        name: formData.name,
        description: formData.description || undefined,
        check_type: formData.check_type as any,
        target: formData.target,
        expected_status_code: formData.expected_status_code ? parseInt(formData.expected_status_code) : undefined,
        expected_content: formData.expected_content || undefined,
        proxy_address: formData.proxy_address || undefined,
        dns_server: formData.dns_server || undefined,
        expected_ip: formData.expected_ip || undefined,
        dns_record_type: formData.dns_record_type || undefined,
        timeout_seconds: parseInt(formData.timeout_seconds),
        interval_seconds: parseInt(formData.interval_seconds),
        failure_threshold: parseInt(formData.failure_threshold),
        alert_interval_hours: parseInt(formData.alert_interval_hours),
        assigned_agent: formData.assigned_agent === 'any' ? undefined : formData.assigned_agent,
      };

      await onSave(data, check?.id);
    } catch (err: any) {
      setError(err.message || 'Failed to save check');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl border border-gray-800 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-800">
          <h2 className="text-xl font-semibold text-white">
            {check ? 'Edit Check' : 'Add New Check'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-400 mb-1">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Type</label>
              <select
                value={formData.check_type}
                onChange={(e) => setFormData({ ...formData, check_type: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
              >
                {checkTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Agent</label>
              <select
                value={formData.assigned_agent}
                onChange={(e) => setFormData({ ...formData, assigned_agent: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
              >
                {agents.map((agent) => (
                  <option key={agent.hostname} value={agent.hostname}>
                    {agent.hostname} {agent.status !== 'available' && `(${agent.status})`}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-400 mb-1">Target URL/Hostname</label>
              <input
                type="text"
                value={formData.target}
                onChange={(e) => setFormData({ ...formData, target: e.target.value })}
                placeholder={formData.check_type === 'dns' ? 'example.com' : 'https://example.com'}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                required
              />
            </div>
          </div>

          {/* Type-specific fields */}
          {(formData.check_type === 'http' || formData.check_type === 'file') && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Expected Status Code</label>
                <input
                  type="number"
                  value={formData.expected_status_code}
                  onChange={(e) => setFormData({ ...formData, expected_status_code: e.target.value })}
                  placeholder="200"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Expected Content</label>
                <input
                  type="text"
                  value={formData.expected_content}
                  onChange={(e) => setFormData({ ...formData, expected_content: e.target.value })}
                  placeholder="Search for this text"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {formData.check_type === 'http_proxy' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-400 mb-1">Proxy Address</label>
                <input
                  type="text"
                  value={formData.proxy_address}
                  onChange={(e) => setFormData({ ...formData, proxy_address: e.target.value })}
                  placeholder="http://proxy:8080"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Expected Content</label>
                <input
                  type="text"
                  value={formData.expected_content}
                  onChange={(e) => setFormData({ ...formData, expected_content: e.target.value })}
                  placeholder="Search for this text"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {formData.check_type === 'dns' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">DNS Server (optional)</label>
                <input
                  type="text"
                  value={formData.dns_server}
                  onChange={(e) => setFormData({ ...formData, dns_server: e.target.value })}
                  placeholder="8.8.8.8"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Record Type</label>
                <select
                  value={formData.dns_record_type}
                  onChange={(e) => setFormData({ ...formData, dns_record_type: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="A">A</option>
                  <option value="AAAA">AAAA</option>
                  <option value="CNAME">CNAME</option>
                  <option value="MX">MX</option>
                  <option value="TXT">TXT</option>
                  <option value="NS">NS</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-400 mb-1">Expected IP (optional)</label>
                <input
                  type="text"
                  value={formData.expected_ip}
                  onChange={(e) => setFormData({ ...formData, expected_ip: e.target.value })}
                  placeholder="1.2.3.4"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Timing & Alerting */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Timeout (s)</label>
              <input
                type="number"
                value={formData.timeout_seconds}
                onChange={(e) => setFormData({ ...formData, timeout_seconds: e.target.value })}
                min="1"
                max="120"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Interval (s)</label>
              <input
                type="number"
                value={formData.interval_seconds}
                onChange={(e) => setFormData({ ...formData, interval_seconds: e.target.value })}
                min="60"
                max="3600"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Failure Threshold</label>
              <input
                type="number"
                value={formData.failure_threshold}
                onChange={(e) => setFormData({ ...formData, failure_threshold: e.target.value })}
                min="1"
                max="10"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Re-alert (hrs)</label>
              <input
                type="number"
                value={formData.alert_interval_hours}
                onChange={(e) => setFormData({ ...formData, alert_interval_hours: e.target.value })}
                min="1"
                max="24"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Description (optional)</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : check ? 'Save Changes' : 'Create Check'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
