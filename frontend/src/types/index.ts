export interface User {
  username: string;
  email: string;
  role: string;
  vault_unlocked: boolean;
}

export interface Label {
  id?: number;
  name: string;
  color: string;
}

export interface Comment {
  id: number;
  author: string;
  content: string;
  created_at: string;
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignee: string | null;
  due_date: string | null;
  is_recurring: boolean;
  recurrence_interval: 'daily' | 'weekly' | 'monthly' | null;
  is_archived: boolean;
  position: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  labels: Label[];
  comments: Comment[];
}

export interface Credential {
  id: number;
  name: string;
  credential_type: 'password' | 'ssh_key' | 'api_token' | 'certificate';
  value: string;
  notes: string | null;
  username: string | null;
  url: string | null;
  created_at: string;
  updated_at: string;
}

export interface DashboardStats {
  total_tasks: number;
  todo_count: number;
  in_progress_count: number;
  done_count: number;
  overdue_count: number;
  my_tasks_count: number;
}

export interface TaskSummary {
  id: number;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  assignee: string | null;
}

export interface DashboardData {
  stats: DashboardStats;
  tasks_due_soon: TaskSummary[];
  recent_tasks: TaskSummary[];
  system_health: { status: string; message: string };
  ansible_jobs: { status: string; message: string };
}

export interface VaultStatus {
  has_vault: boolean;
  is_unlocked: boolean;
}

// Monitoring types
export interface MonitoringStatus {
  enabled: boolean;
  prometheus_available: boolean;
  geoip_available: boolean;
  connected_agents: number;
  total_agents: number;
}

export interface MonitoringAgent {
  id: number;
  hostname: string;
  ip_address: string;
  version: string | null;
  os_info: string | null;
  status: 'online' | 'offline' | 'stale';
  last_seen: string | null;
  is_active: boolean;
  report_interval_seconds: number;
  created_at: string;
}

export interface ThreatEvent {
  id: number;
  agent_hostname: string;
  source_ip: string;
  source_port: number | null;
  dest_ip: string | null;
  dest_port: number | null;
  protocol: string | null;
  country_code: string | null;
  country_name: string | null;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  event_time: string;
}

export interface MapPoint {
  lat: number;
  lng: number;
  count: number;
  country_code: string | null;
  country_name: string | null;
}

export interface ThreatSummary {
  total_events: number;
  unique_ips: number;
  top_countries: Array<{ code: string; name: string; count: number }>;
  top_ports: Array<{ port: number; count: number }>;
  hourly_counts: Array<{ hour: string; count: number }>;
  period: { start: string; end: string };
}

export interface HealthCheck {
  hostname: string;
  check_name: string;
  check_type: string;
  is_healthy: boolean;
  latency_ms: number | null;
  message: string | null;
  check_time: string;
}

export interface HostMetrics {
  hostname: string;
  instance: string;
  cpu_usage_percent: number | null;
  memory_usage_percent: number | null;
  memory_total_bytes: number | null;
  memory_used_bytes: number | null;
  disk_usage_percent: number | null;
  disk_total_bytes: number | null;
  disk_used_bytes: number | null;
  network_rx_bytes_per_sec: number | null;
  network_tx_bytes_per_sec: number | null;
  uptime_seconds: number | null;
  load_average_1m: number | null;
  load_average_5m: number | null;
  load_average_15m: number | null;
}

export interface MetricValue {
  timestamp: string;
  value: number;
}

// Google Drive types
export interface DriveStatus {
  enabled: boolean;
  drives_count: number;
}

export interface SharedDrive {
  id: string;
  name: string;
}

export interface DriveFile {
  id: string;
  name: string;
  mime_type: string;
  size: number | null;
  modified_time: string;
  modified_by: string | null;
  is_folder: boolean;
  parent_id: string | null;
  web_view_link: string | null;
  thumbnail_link: string | null;
}

export interface FileListResponse {
  files: DriveFile[];
  next_page_token: string | null;
}

export interface BreadcrumbItem {
  id: string;
  name: string;
}
