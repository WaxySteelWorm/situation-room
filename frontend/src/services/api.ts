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
  MetricValue
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

// Alerts API
export interface AlertSettings {
  alerts_enabled: boolean;
  discord_webhook_url: string | null;
  discord_enabled: boolean;
  email_enabled: boolean;
  email_recipients: string[];
  default_cpu_threshold: number;
  default_memory_threshold: number;
  default_disk_threshold: number;
  default_load_threshold: number;
  check_interval_seconds: number;
  quiet_hours_enabled: boolean;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
}

export interface AlertRule {
  id: number;
  name: string;
  description: string | null;
  alert_type: string;
  enabled: boolean;
  severity: string;
  conditions: Record<string, number> | null;
  host_filter: string[] | null;
  notify_discord: boolean;
  notify_email: boolean;
  cooldown_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface AlertHistory {
  id: number;
  rule_id: number | null;
  rule_name: string;
  alert_type: string;
  severity: string;
  hostname: string | null;
  message: string;
  details: Record<string, unknown> | null;
  metric_value: number | null;
  threshold_value: number | null;
  discord_sent: boolean;
  email_sent: boolean;
  is_resolved: boolean;
  resolved_at: string | null;
  triggered_at: string;
}

export interface AlertType {
  value: string;
  label: string;
  category: string;
}

export interface AlertSeverity {
  value: string;
  label: string;
  color: string;
}

export const alertsApi = {
  // Settings
  getSettings: () =>
    request<AlertSettings>('/alerts/settings'),

  updateSettings: (settings: Partial<AlertSettings>) =>
    request<AlertSettings>('/alerts/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  // Rules
  getRules: () =>
    request<AlertRule[]>('/alerts/rules'),

  createRule: (rule: {
    name: string;
    description?: string;
    alert_type: string;
    enabled?: boolean;
    severity?: string;
    conditions?: Record<string, number>;
    host_filter?: string[];
    notify_discord?: boolean;
    notify_email?: boolean;
    cooldown_minutes?: number;
  }) =>
    request<AlertRule>('/alerts/rules', {
      method: 'POST',
      body: JSON.stringify(rule),
    }),

  updateRule: (id: number, rule: Partial<{
    name: string;
    description: string;
    enabled: boolean;
    severity: string;
    conditions: Record<string, number>;
    host_filter: string[];
    notify_discord: boolean;
    notify_email: boolean;
    cooldown_minutes: number;
  }>) =>
    request<AlertRule>(`/alerts/rules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(rule),
    }),

  deleteRule: (id: number) =>
    request<{ status: string }>(`/alerts/rules/${id}`, { method: 'DELETE' }),

  // History
  getHistory: (params?: {
    limit?: number;
    offset?: number;
    unresolved_only?: boolean;
    hostname?: string;
    severity?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    if (params?.unresolved_only) query.set('unresolved_only', 'true');
    if (params?.hostname) query.set('hostname', params.hostname);
    if (params?.severity) query.set('severity', params.severity);
    return request<AlertHistory[]>(`/alerts/history?${query.toString()}`);
  },

  resolveAlert: (id: number) =>
    request<{ status: string }>(`/alerts/history/${id}/resolve`, { method: 'POST' }),

  // Meta
  getTypes: () =>
    request<AlertType[]>('/alerts/types'),

  getSeverities: () =>
    request<AlertSeverity[]>('/alerts/severities'),

  // Test
  testNotification: (channel: string) =>
    request<{ status: string; channel: string }>(`/alerts/test?channel=${channel}`, {
      method: 'POST',
    }),
};

// Google Drive API
import type {
  DriveStatus,
  SharedDrive,
  DriveFile,
  FileListResponse,
  BreadcrumbItem,
} from '../types';

export const driveApi = {
  // Status
  getStatus: () =>
    request<DriveStatus>('/drive/status'),

  // Drives
  getDrives: () =>
    request<SharedDrive[]>('/drive/drives'),

  // Files
  listFiles: (driveId: string, folderId?: string, pageToken?: string, pageSize = 100, orderBy = 'folder,name') => {
    const params = new URLSearchParams();
    if (folderId) params.append('folder_id', folderId);
    if (pageToken) params.append('page_token', pageToken);
    params.append('page_size', String(pageSize));
    params.append('order_by', orderBy);
    return request<FileListResponse>(`/drive/${driveId}/files?${params.toString()}`);
  },

  searchFiles: (driveId: string, query: string, pageSize = 50) =>
    request<DriveFile[]>(`/drive/${driveId}/search?q=${encodeURIComponent(query)}&page_size=${pageSize}`),

  getBreadcrumbs: (driveId: string, folderId?: string) => {
    const params = folderId ? `?folder_id=${folderId}` : '';
    return request<BreadcrumbItem[]>(`/drive/${driveId}/breadcrumbs${params}`);
  },

  getFile: (fileId: string) =>
    request<DriveFile>(`/drive/files/${fileId}`),

  downloadFile: (fileId: string) =>
    `/api/drive/files/${fileId}/download`,

  previewFile: (fileId: string) =>
    `/api/drive/files/${fileId}/preview`,

  uploadFile: async (driveId: string, parentId: string, file: File): Promise<DriveFile> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`/api/drive/${driveId}/upload?parent_id=${parentId}`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ detail: 'Upload failed' }));
      throw new ApiError(response.status, data.detail || 'Upload failed');
    }

    return response.json();
  },

  createFolder: (driveId: string, parentId: string, name: string) =>
    request<DriveFile>(`/drive/${driveId}/folder`, {
      method: 'POST',
      body: JSON.stringify({ name, parent_id: parentId }),
    }),

  renameFile: (fileId: string, newName: string) =>
    request<DriveFile>(`/drive/files/${fileId}/rename`, {
      method: 'PUT',
      body: JSON.stringify({ new_name: newName }),
    }),

  moveFile: (fileId: string, newParentId: string) =>
    request<DriveFile>(`/drive/files/${fileId}/move`, {
      method: 'PUT',
      body: JSON.stringify({ new_parent_id: newParentId }),
    }),

  deleteFile: (fileId: string) =>
    request<{ message: string }>(`/drive/files/${fileId}`, { method: 'DELETE' }),
};

export { ApiError };
