import type { User, Task, Credential, DashboardData, VaultStatus, Label } from '../types';

const API_BASE = '/api';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new ApiError(response.status, data.detail || 'Request failed');
  }

  return response.json();
}

// Auth API
export const authApi = {
  login: (username: string, password: string) =>
    request<{ username: string; email: string; role: string; message: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: () =>
    request<{ message: string }>('/auth/logout', { method: 'POST' }),

  me: () =>
    request<User>('/auth/me'),

  refresh: () =>
    request<{ message: string }>('/auth/refresh', { method: 'POST' }),

  getConfig: () =>
    request<{
      sso_enabled: boolean;
      allow_password_login: boolean;
      providers: Array<{ name: string; id: string }>;
    }>('/auth/config'),

  getSsoAuthorizeUrl: (provider: string) =>
    `/api/auth/sso/${provider}/authorize`,
};

// Tasks API
export const tasksApi = {
  getAll: (includeArchived = false) =>
    request<Task[]>(`/tasks?include_archived=${includeArchived}`),

  getByStatus: (status: string, includeArchived = false) =>
    request<Task[]>(`/tasks/status/${status}?include_archived=${includeArchived}`),

  getDueSoon: (days = 1) =>
    request<Task[]>(`/tasks/due-soon?days=${days}`),

  getMyTasks: () =>
    request<Task[]>('/tasks/my-tasks'),

  get: (id: number) =>
    request<Task>(`/tasks/${id}`),

  create: (task: {
    title: string;
    description?: string;
    assignee?: string;
    due_date?: string;
    priority?: string;
    is_recurring?: boolean;
    recurrence_interval?: string;
    labels?: Label[];
  }) =>
    request<Task>('/tasks', {
      method: 'POST',
      body: JSON.stringify(task),
    }),

  update: (id: number, task: Partial<{
    title: string;
    description: string;
    status: string;
    assignee: string;
    due_date: string;
    priority: string;
    position: number;
  }>) =>
    request<Task>(`/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(task),
    }),

  move: (id: number, status: string, position: number) =>
    request<Task>(`/tasks/${id}/move`, {
      method: 'POST',
      body: JSON.stringify({ status, position }),
    }),

  archive: (id: number) =>
    request<Task>(`/tasks/${id}/archive`, { method: 'POST' }),

  addComment: (id: number, content: string) =>
    request<{ id: number; author: string; content: string; created_at: string }>(`/tasks/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  addLabel: (id: number, name: string, color: string) =>
    request<Label>(`/tasks/${id}/labels`, {
      method: 'POST',
      body: JSON.stringify({ name, color }),
    }),

  removeLabel: (taskId: number, labelId: number) =>
    request<{ message: string }>(`/tasks/${taskId}/labels/${labelId}`, {
      method: 'DELETE',
    }),
};

// Credentials API
export const credentialsApi = {
  getVaultStatus: () =>
    request<VaultStatus>('/credentials/vault/status'),

  setupVault: (masterPassword: string) =>
    request<{ message: string }>('/credentials/vault/setup', {
      method: 'POST',
      body: JSON.stringify({ master_password: masterPassword }),
    }),

  unlockVault: (masterPassword: string) =>
    request<{ message: string }>('/credentials/vault/unlock', {
      method: 'POST',
      body: JSON.stringify({ master_password: masterPassword }),
    }),

  lockVault: () =>
    request<{ message: string }>('/credentials/vault/lock', { method: 'POST' }),

  getAll: () =>
    request<Credential[]>('/credentials'),

  get: (id: number) =>
    request<Credential>(`/credentials/${id}`),

  create: (credential: {
    name: string;
    value: string;
    credential_type?: string;
    notes?: string;
    username?: string;
    url?: string;
  }) =>
    request<Credential>('/credentials', {
      method: 'POST',
      body: JSON.stringify(credential),
    }),

  update: (id: number, credential: Partial<{
    name: string;
    value: string;
    credential_type: string;
    notes: string;
    username: string;
    url: string;
  }>) =>
    request<Credential>(`/credentials/${id}`, {
      method: 'PUT',
      body: JSON.stringify(credential),
    }),

  delete: (id: number) =>
    request<{ message: string }>(`/credentials/${id}`, { method: 'DELETE' }),

  generatePassword: (options: {
    length?: number;
    uppercase?: boolean;
    lowercase?: boolean;
    numbers?: boolean;
    symbols?: boolean;
  } = {}) =>
    request<{ password: string }>('/credentials/generate-password', {
      method: 'POST',
      body: JSON.stringify(options),
    }),
};

// Dashboard API
export const dashboardApi = {
  get: () =>
    request<DashboardData>('/dashboard'),
};

// Documents API
export interface DocumentSummary {
  id: number;
  title: string;
  slug: string;
  parent_id: number | null;
  is_pinned: boolean;
  sort_order: number;
  has_children: boolean;
}

export interface Document {
  id: number;
  title: string;
  slug: string;
  content: string;
  parent_id: number | null;
  author: string;
  last_edited_by: string;
  is_pinned: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  children: DocumentSummary[];
}

export const documentsApi = {
  getAll: (parentId?: number) =>
    request<DocumentSummary[]>(parentId ? `/documents?parent_id=${parentId}` : '/documents'),

  getTree: () =>
    request<DocumentSummary[]>('/documents/tree'),

  search: (query: string) =>
    request<DocumentSummary[]>(`/documents/search?q=${encodeURIComponent(query)}`),

  get: (id: number) =>
    request<Document>(`/documents/${id}`),

  getBySlug: (slug: string) =>
    request<Document>(`/documents/slug/${slug}`),

  create: (doc: {
    title: string;
    content?: string;
    parent_id?: number;
    is_pinned?: boolean;
  }) =>
    request<Document>('/documents', {
      method: 'POST',
      body: JSON.stringify(doc),
    }),

  update: (id: number, doc: {
    title?: string;
    content?: string;
    parent_id?: number;
    is_pinned?: boolean;
  }) =>
    request<Document>(`/documents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(doc),
    }),

  delete: (id: number) =>
    request<{ message: string }>(`/documents/${id}`, { method: 'DELETE' }),
};

// Columns API
export interface Column {
  id: number;
  name: string;
  slug: string;
  color: string;
  position: number;
}

export const columnsApi = {
  getAll: () =>
    request<Column[]>('/columns'),

  create: (column: {
    name: string;
    color?: string;
    position?: number;
  }) =>
    request<Column>('/columns', {
      method: 'POST',
      body: JSON.stringify(column),
    }),

  update: (id: number, column: {
    name?: string;
    color?: string;
    position?: number;
  }) =>
    request<Column>(`/columns/${id}`, {
      method: 'PUT',
      body: JSON.stringify(column),
    }),

  delete: (id: number) =>
    request<{ message: string }>(`/columns/${id}`, { method: 'DELETE' }),

  reorder: (columnIds: number[]) =>
    request<Column[]>('/columns/reorder', {
      method: 'POST',
      body: JSON.stringify({ column_ids: columnIds }),
    }),
};

// Users API
export interface UserProfile {
  id: number;
  email: string;
  name: string;
  picture: string | null;
  role: string;
  is_active: boolean;
  provider: string | null;
  last_login: string | null;
}

export const usersApi = {
  getAll: (activeOnly = true) =>
    request<UserProfile[]>(`/users?active_only=${activeOnly}`),

  search: (query: string, limit = 10) =>
    request<UserProfile[]>(`/users/search?q=${encodeURIComponent(query)}&limit=${limit}`),

  getMe: () =>
    request<UserProfile>('/users/me'),

  get: (id: number) =>
    request<UserProfile>(`/users/${id}`),

  update: (id: number, data: { name?: string; role?: string; is_active?: boolean }) =>
    request<UserProfile>(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    request<{ message: string }>(`/users/${id}`, { method: 'DELETE' }),
};

// Health API
export const healthApi = {
  check: () =>
    request<{ status: string; service: string }>('/health'),
};

// Monitoring API
import type {
  MonitoringStatus,
  MonitoringAgent,
  ThreatEvent,
  ThreatSummary,
  MapPoint,
  HealthCheck,
  HostMetrics,
  MetricValue,
  NetworkStatus,
  BGPEvent,
  BGPPrefixStatus,
  BGPSummary,
  TrafficSample,
  DailyTrafficSummary,
  InterfaceStats,
  TrafficSummary,
  ObserviumAlert,
  TrafficGraphData
} from '../types';

export const monitoringApi = {
  // Status
  getStatus: () =>
    request<MonitoringStatus>('/monitoring/status'),

  // Agents
  getAgents: (includeInactive = false) =>
    request<MonitoringAgent[]>(`/monitoring/agents?include_inactive=${includeInactive}`),

  getConnectedAgents: () =>
    request<Array<{
      hostname: string;
      ip_address: string;
      connected_at: string;
      last_message: string;
    }>>('/monitoring/agents/connected'),

  // Threats
  getRecentThreats: (minutes = 60, limit = 1000) =>
    request<ThreatEvent[]>(`/monitoring/threats/recent?minutes=${minutes}&limit=${limit}`),

  getThreatSummary: (hours = 24) =>
    request<ThreatSummary>(`/monitoring/threats/summary?hours=${hours}`),

  getMapData: (minutes = 60) =>
    request<MapPoint[]>(`/monitoring/threats/map?minutes=${minutes}`),

  // Health Checks
  getHealthChecks: (hostname?: string) =>
    request<HealthCheck[]>(
      hostname ? `/monitoring/health-checks?hostname=${hostname}` : '/monitoring/health-checks'
    ),

  // Prometheus
  getPrometheusStatus: () =>
    request<{ enabled: boolean; available: boolean; url: string | null }>('/monitoring/prometheus/status'),

  getPrometheusHosts: () =>
    request<{ hosts: string[] }>('/monitoring/prometheus/hosts'),

  getHostMetrics: (instance: string) =>
    request<HostMetrics>(`/monitoring/prometheus/metrics/${encodeURIComponent(instance)}`),

  getAllHostMetrics: () =>
    request<Array<{
      hostname: string;
      instance: string;
      cpu_usage_percent: number | null;
      memory_usage_percent: number | null;
      disk_usage_percent: number | null;
      network_rx_bytes_per_sec: number | null;
      network_tx_bytes_per_sec: number | null;
      uptime_seconds: number | null;
      load_average_1m: number | null;
    }>>('/monitoring/prometheus/metrics'),

  getMetricHistory: (instance: string, metric: string, hours = 24) =>
    request<{
      instance: string;
      metric: string;
      values: MetricValue[];
    }>(`/monitoring/prometheus/history/${encodeURIComponent(instance)}/${metric}?hours=${hours}`),
};

// Network Monitoring API
export const networkApi = {
  // Status
  getStatus: () =>
    request<NetworkStatus>('/network/status'),

  // BGP
  getBGPSummary: () =>
    request<BGPSummary>('/network/bgp/summary'),

  getBGPEvents: (hours = 24, limit = 100) =>
    request<BGPEvent[]>(`/network/bgp/events?hours=${hours}&limit=${limit}`),

  getBGPPrefixes: () =>
    request<BGPPrefixStatus[]>('/network/bgp/prefixes'),

  getBGPRoutes: () =>
    request<Record<string, unknown>>('/network/bgp/routes'),

  getBGPTimeseries: (hours = 24) =>
    request<Record<string, unknown>>(`/network/bgp/timeseries?hours=${hours}`),

  getASOverview: () =>
    request<Record<string, unknown>>('/network/bgp/as-overview'),

  pollBGP: () =>
    request<Record<string, unknown>>('/network/bgp/poll', { method: 'POST' }),

  // Traffic
  getTrafficSummary: () =>
    request<TrafficSummary>('/network/traffic/summary'),

  getInterfaceStats: () =>
    request<InterfaceStats[]>('/network/traffic/interfaces'),

  getTrafficSamples: (interfaceName: string, minutes = 60) =>
    request<TrafficSample[]>(`/network/traffic/samples/${encodeURIComponent(interfaceName)}?minutes=${minutes}`),

  getTrafficGraphData: (interfaceName: string, hours = 24) =>
    request<{ interface_name: string; data: TrafficGraphData[] }>(`/network/traffic/graph/${encodeURIComponent(interfaceName)}?hours=${hours}`),

  getDailyTraffic: (interfaceName: string, days = 30) =>
    request<DailyTrafficSummary[]>(`/network/traffic/daily/${encodeURIComponent(interfaceName)}?days=${days}`),

  pollTraffic: () =>
    request<Record<string, unknown>>('/network/traffic/poll', { method: 'POST' }),

  // Alerts
  getAlerts: (hours = 24, status?: string) =>
    request<ObserviumAlert[]>(
      status
        ? `/network/alerts?hours=${hours}&status=${status}`
        : `/network/alerts?hours=${hours}`
    ),

  // Observium direct
  getObserviumDevices: () =>
    request<Record<string, unknown>>('/network/observium/devices'),

  getObserviumPorts: (deviceId?: number) =>
    request<Record<string, unknown>>(
      deviceId ? `/network/observium/ports?device_id=${deviceId}` : '/network/observium/ports'
    ),

  getObserviumAlerts: (status = 'all') =>
    request<Record<string, unknown>>(`/network/observium/alerts?status=${status}`),
};

export { ApiError };
