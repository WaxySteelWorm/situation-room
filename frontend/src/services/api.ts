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

// Health API
export const healthApi = {
  check: () =>
    request<{ status: string; service: string }>('/health'),
};

export { ApiError };
