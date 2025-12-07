import { useState, useEffect } from 'react';
import {
  Settings,
  Bell,
  Shield,
  Save,
  Plus,
  Trash2,
  Edit2,
  X,
  MessageCircle,
  Mail,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Send,
  History,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { alertsApi, type AlertSettings, type AlertRule, type AlertHistory, type AlertType, type AlertSeverity as AlertSeverityType } from '../services/api';

type TabType = 'general' | 'rules' | 'history';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [settings, setSettings] = useState<AlertSettings | null>(null);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [history, setHistory] = useState<AlertHistory[]>([]);
  const [alertTypes, setAlertTypes] = useState<AlertType[]>([]);
  const [severities, setSeverities] = useState<AlertSeverityType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Rule modal state
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [settingsData, rulesData, historyData, typesData, severitiesData] = await Promise.all([
        alertsApi.getSettings(),
        alertsApi.getRules(),
        alertsApi.getHistory({ limit: 50 }),
        alertsApi.getTypes(),
        alertsApi.getSeverities(),
      ]);
      setSettings(settingsData);
      setRules(rulesData);
      setHistory(historyData);
      setAlertTypes(typesData);
      setSeverities(severitiesData);
    } catch (err) {
      console.error('Failed to load settings:', err);
      setError('Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    try {
      setIsSaving(true);
      setError(null);
      await alertsApi.updateSettings(settings);
      setSuccess('Settings saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
      setError('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const testNotification = async (channel: 'discord' | 'email') => {
    try {
      setError(null);
      await alertsApi.testNotification(channel);
      setSuccess(`Test ${channel} notification sent`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send test notification';
      setError(message);
    }
  };

  const handleDeleteRule = async (id: number) => {
    if (!confirm('Are you sure you want to delete this rule?')) return;
    try {
      await alertsApi.deleteRule(id);
      setRules(rules.filter(r => r.id !== id));
      setSuccess('Rule deleted');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to delete rule:', err);
      setError('Failed to delete rule');
    }
  };

  const handleToggleRule = async (rule: AlertRule) => {
    try {
      await alertsApi.updateRule(rule.id, { enabled: !rule.enabled });
      setRules(rules.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
    } catch (err) {
      console.error('Failed to toggle rule:', err);
      setError('Failed to toggle rule');
    }
  };

  const handleResolveAlert = async (id: number) => {
    try {
      await alertsApi.resolveAlert(id);
      setHistory(history.map(h => h.id === id ? { ...h, is_resolved: true, resolved_at: new Date().toISOString() } : h));
    } catch (err) {
      console.error('Failed to resolve alert:', err);
      setError('Failed to resolve alert');
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <RefreshCw className="animate-spin text-gray-400" size={32} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/10 rounded-lg">
            <Settings size={24} className="text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Settings</h1>
            <p className="text-sm text-gray-500">Alert configuration and notifications</p>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertTriangle size={18} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <X size={18} />
          </button>
        </div>
      )}
      {success && (
        <div className="bg-green-500/10 border border-green-500/50 text-green-400 px-4 py-3 rounded-lg flex items-center gap-2">
          <CheckCircle size={18} />
          {success}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-800 pb-2">
        <TabButton active={activeTab === 'general'} onClick={() => setActiveTab('general')} icon={Bell} label="General" />
        <TabButton active={activeTab === 'rules'} onClick={() => setActiveTab('rules')} icon={Shield} label="Alert Rules" />
        <TabButton active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={History} label="Alert History" />
      </div>

      {/* General Settings */}
      {activeTab === 'general' && settings && (
        <div className="space-y-6">
          {/* Master Toggle */}
          <SettingsCard title="Alert System" description="Enable or disable the entire alerting system">
            <Toggle
              checked={settings.alerts_enabled}
              onChange={(checked) => setSettings({ ...settings, alerts_enabled: checked })}
              label="Enable Alerts"
            />
          </SettingsCard>

          {/* Discord Settings */}
          <SettingsCard title="Discord Notifications" description="Send alerts to a Discord channel via webhook">
            <div className="space-y-4">
              <Toggle
                checked={settings.discord_enabled}
                onChange={(checked) => setSettings({ ...settings, discord_enabled: checked })}
                label="Enable Discord"
              />
              <div>
                <label className="block text-sm text-gray-400 mb-2">Webhook URL</label>
                <input
                  type="text"
                  value={settings.discord_webhook_url || ''}
                  onChange={(e) => setSettings({ ...settings, discord_webhook_url: e.target.value })}
                  placeholder="https://discord.com/api/webhooks/..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
                />
              </div>
              <button
                onClick={() => testNotification('discord')}
                disabled={!settings.discord_enabled || !settings.discord_webhook_url}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
              >
                <Send size={16} />
                Send Test
              </button>
            </div>
          </SettingsCard>

          {/* Email Settings */}
          <SettingsCard title="Email Notifications" description="Send alerts via email (coming soon)">
            <div className="space-y-4">
              <Toggle
                checked={settings.email_enabled}
                onChange={(checked) => setSettings({ ...settings, email_enabled: checked })}
                label="Enable Email"
                disabled
              />
              <p className="text-sm text-gray-500">Email notifications are not yet implemented.</p>
            </div>
          </SettingsCard>

          {/* Default Thresholds */}
          <SettingsCard title="Default Thresholds" description="Default values for new alert rules">
            <div className="grid grid-cols-2 gap-4">
              <ThresholdInput
                label="CPU Threshold (%)"
                value={settings.default_cpu_threshold}
                onChange={(value) => setSettings({ ...settings, default_cpu_threshold: value })}
              />
              <ThresholdInput
                label="Memory Threshold (%)"
                value={settings.default_memory_threshold}
                onChange={(value) => setSettings({ ...settings, default_memory_threshold: value })}
              />
              <ThresholdInput
                label="Disk Threshold (%)"
                value={settings.default_disk_threshold}
                onChange={(value) => setSettings({ ...settings, default_disk_threshold: value })}
              />
              <ThresholdInput
                label="Load Threshold"
                value={settings.default_load_threshold}
                onChange={(value) => setSettings({ ...settings, default_load_threshold: value })}
              />
            </div>
          </SettingsCard>

          {/* Check Interval */}
          <SettingsCard title="Check Interval" description="How often to check for alert conditions">
            <div className="flex items-center gap-4">
              <input
                type="number"
                value={settings.check_interval_seconds}
                onChange={(e) => setSettings({ ...settings, check_interval_seconds: parseInt(e.target.value) || 60 })}
                min={30}
                max={3600}
                className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-purple-500 focus:outline-none"
              />
              <span className="text-gray-400">seconds</span>
            </div>
          </SettingsCard>

          {/* Quiet Hours */}
          <SettingsCard title="Quiet Hours" description="Disable notifications during specific hours">
            <div className="space-y-4">
              <Toggle
                checked={settings.quiet_hours_enabled}
                onChange={(checked) => setSettings({ ...settings, quiet_hours_enabled: checked })}
                label="Enable Quiet Hours"
              />
              {settings.quiet_hours_enabled && (
                <div className="flex items-center gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Start (UTC)</label>
                    <select
                      value={settings.quiet_hours_start ?? 22}
                      onChange={(e) => setSettings({ ...settings, quiet_hours_start: parseInt(e.target.value) })}
                      className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-purple-500 focus:outline-none"
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>{i.toString().padStart(2, '0')}:00</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">End (UTC)</label>
                    <select
                      value={settings.quiet_hours_end ?? 7}
                      onChange={(e) => setSettings({ ...settings, quiet_hours_end: parseInt(e.target.value) })}
                      className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-purple-500 focus:outline-none"
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>{i.toString().padStart(2, '0')}:00</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </SettingsCard>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={saveSettings}
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white rounded-lg transition-colors"
            >
              {isSaving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
              Save Settings
            </button>
          </div>
        </div>
      )}

      {/* Alert Rules */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => { setEditingRule(null); setShowRuleModal(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
            >
              <Plus size={18} />
              Add Rule
            </button>
          </div>

          {rules.length === 0 ? (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
              <Shield size={48} className="mx-auto mb-4 text-gray-600" />
              <h3 className="text-lg font-medium text-gray-400 mb-2">No Alert Rules</h3>
              <p className="text-gray-500">Create your first alert rule to start monitoring.</p>
            </div>
          ) : (
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Rule</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Type</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Severity</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Channels</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Status</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {rules.map((rule) => (
                    <tr key={rule.id} className="hover:bg-gray-800/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{rule.name}</div>
                        {rule.description && (
                          <div className="text-sm text-gray-500">{rule.description}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {alertTypes.find(t => t.value === rule.alert_type)?.label || rule.alert_type}
                      </td>
                      <td className="px-4 py-3">
                        <SeverityBadge severity={rule.severity} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {rule.notify_discord && <span title="Discord"><MessageCircle size={16} className="text-indigo-400" /></span>}
                          {rule.notify_email && <span title="Email"><Mail size={16} className="text-blue-400" /></span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleToggleRule(rule)}
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            rule.enabled
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-gray-700 text-gray-400'
                          }`}
                        >
                          {rule.enabled ? 'Enabled' : 'Disabled'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => { setEditingRule(rule); setShowRuleModal(true); }}
                            className="p-1 hover:bg-gray-700 rounded"
                          >
                            <Edit2 size={16} className="text-gray-400" />
                          </button>
                          <button
                            onClick={() => handleDeleteRule(rule.id)}
                            className="p-1 hover:bg-gray-700 rounded"
                          >
                            <Trash2 size={16} className="text-red-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Alert History */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {history.length === 0 ? (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
              <History size={48} className="mx-auto mb-4 text-gray-600" />
              <h3 className="text-lg font-medium text-gray-400 mb-2">No Alerts</h3>
              <p className="text-gray-500">Alert history will appear here when alerts are triggered.</p>
            </div>
          ) : (
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Time</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Rule</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Hostname</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Message</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Severity</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Status</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {history.map((alert) => (
                    <tr key={alert.id} className="hover:bg-gray-800/50">
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {new Date(alert.triggered_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-white">{alert.rule_name}</td>
                      <td className="px-4 py-3 text-gray-400 font-mono text-sm">{alert.hostname || '-'}</td>
                      <td className="px-4 py-3 text-gray-300 text-sm max-w-xs truncate">{alert.message}</td>
                      <td className="px-4 py-3">
                        <SeverityBadge severity={alert.severity} />
                      </td>
                      <td className="px-4 py-3">
                        {alert.is_resolved ? (
                          <span className="text-green-400 text-sm flex items-center gap-1">
                            <CheckCircle size={14} />
                            Resolved
                          </span>
                        ) : (
                          <span className="text-amber-400 text-sm flex items-center gap-1">
                            <AlertTriangle size={14} />
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!alert.is_resolved && (
                          <button
                            onClick={() => handleResolveAlert(alert.id)}
                            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors"
                          >
                            Resolve
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Rule Modal */}
      {showRuleModal && (
        <RuleModal
          rule={editingRule}
          alertTypes={alertTypes}
          severities={severities}
          onClose={() => setShowRuleModal(false)}
          onSave={async (ruleData) => {
            try {
              const payload = {
                name: ruleData.name,
                alert_type: ruleData.alert_type,
                description: ruleData.description || undefined,
                enabled: ruleData.enabled,
                severity: ruleData.severity,
                conditions: ruleData.conditions || undefined,
                host_filter: ruleData.host_filter || undefined,
                notify_discord: ruleData.notify_discord,
                notify_email: ruleData.notify_email,
                cooldown_minutes: ruleData.cooldown_minutes,
              };
              if (editingRule) {
                const updated = await alertsApi.updateRule(editingRule.id, payload);
                setRules(rules.map(r => r.id === editingRule.id ? updated : r));
              } else {
                const created = await alertsApi.createRule(payload);
                setRules([...rules, created]);
              }
              setShowRuleModal(false);
              setSuccess(editingRule ? 'Rule updated' : 'Rule created');
              setTimeout(() => setSuccess(null), 3000);
            } catch (err) {
              console.error('Failed to save rule:', err);
              setError('Failed to save rule');
            }
          }}
        />
      )}
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
  icon: typeof Bell;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
        active
          ? 'bg-purple-600 text-white'
          : 'text-gray-400 hover:bg-gray-800 hover:text-white'
      }`}
    >
      <Icon size={18} />
      {label}
    </button>
  );
}

function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
      {children}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center gap-3 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <button
        type="button"
        onClick={() => !disabled && onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors ${
          checked ? 'bg-purple-600' : 'bg-gray-700'
        }`}
        disabled={disabled}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-5' : ''
          }`}
        />
      </button>
      <span className="text-white">{label}</span>
    </label>
  );
}

function ThresholdInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label className="block text-sm text-gray-400 mb-2">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        min={0}
        max={100}
        step={0.1}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-purple-500 focus:outline-none"
      />
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    info: 'bg-blue-500/20 text-blue-400',
    warning: 'bg-amber-500/20 text-amber-400',
    critical: 'bg-red-500/20 text-red-400',
  };
  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${colors[severity] || 'bg-gray-700 text-gray-400'}`}>
      {severity}
    </span>
  );
}

function RuleModal({
  rule,
  alertTypes,
  severities,
  onClose,
  onSave,
}: {
  rule: AlertRule | null;
  alertTypes: AlertType[];
  severities: AlertSeverityType[];
  onClose: () => void;
  onSave: (rule: Partial<AlertRule> & { name: string; alert_type: string }) => void;
}) {
  const [name, setName] = useState(rule?.name || '');
  const [description, setDescription] = useState(rule?.description || '');
  const [alertType, setAlertType] = useState(rule?.alert_type || alertTypes[0]?.value || '');
  const [severity, setSeverity] = useState(rule?.severity || 'warning');
  const [threshold, setThreshold] = useState(rule?.conditions?.threshold || 80);
  const [notifyDiscord, setNotifyDiscord] = useState(rule?.notify_discord ?? true);
  const [notifyEmail, setNotifyEmail] = useState(rule?.notify_email ?? false);
  const [cooldownMinutes, setCooldownMinutes] = useState(rule?.cooldown_minutes || 15);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const needsThreshold = ['cpu_high', 'memory_high', 'disk_high', 'load_high'].includes(alertType);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">
            {rule ? 'Edit Alert Rule' : 'New Alert Rule'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded">
            <X size={20} className="text-gray-400" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., High CPU Alert"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Alert Type *</label>
            <select
              value={alertType}
              onChange={(e) => setAlertType(e.target.value)}
              disabled={!!rule}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-purple-500 focus:outline-none disabled:opacity-50"
            >
              {alertTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label} ({type.category})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Severity</label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-purple-500 focus:outline-none"
            >
              {severities.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          {needsThreshold && (
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Threshold ({alertType === 'load_high' ? 'load average' : '%'})
              </label>
              <input
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value) || 0)}
                min={0}
                max={alertType === 'load_high' ? 100 : 100}
                step={0.1}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-purple-500 focus:outline-none"
              />
            </div>
          )}
          <div className="flex items-center gap-4">
            <Toggle checked={notifyDiscord} onChange={setNotifyDiscord} label="Discord" />
            <Toggle checked={notifyEmail} onChange={setNotifyEmail} label="Email" disabled />
          </div>

          {/* Advanced Settings */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            Advanced Settings
          </button>
          {showAdvanced && (
            <div className="space-y-4 pl-4 border-l border-gray-700">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Cooldown (minutes)</label>
                <input
                  type="number"
                  value={cooldownMinutes}
                  onChange={(e) => setCooldownMinutes(parseInt(e.target.value) || 15)}
                  min={1}
                  max={1440}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-purple-500 focus:outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">Time before re-alerting for the same issue</p>
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 p-4 border-t border-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (!name || !alertType) return;
              onSave({
                name,
                description: description || undefined,
                alert_type: alertType,
                severity,
                conditions: needsThreshold ? { threshold } : undefined,
                notify_discord: notifyDiscord,
                notify_email: notifyEmail,
                cooldown_minutes: cooldownMinutes,
              });
            }}
            disabled={!name || !alertType}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
          >
            {rule ? 'Update Rule' : 'Create Rule'}
          </button>
        </div>
      </div>
    </div>
  );
}
