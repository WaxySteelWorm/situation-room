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

// Service Checks types
export type ServiceCheckType = 'http' | 'http_proxy' | 'dns' | 'file';
export type ServiceCheckStatus = 'passing' | 'failing' | 'unknown';

export interface ServiceCheck {
  id: number;
  name: string;
  description: string | null;
  check_type: ServiceCheckType;
  target: string;
  is_enabled: boolean;
  expected_status_code: number | null;
  expected_content: string | null;
  proxy_address: string | null;
  dns_server: string | null;
  expected_ip: string | null;
  dns_record_type: string | null;
  timeout_seconds: number;
  interval_seconds: number;
  failure_threshold: number;
  alert_interval_hours: number;
  assigned_agent: string | null;
  current_status: ServiceCheckStatus;
  consecutive_failures: number;
  last_check_time: string | null;
  last_success_time: string | null;
  last_failure_time: string | null;
  last_latency_ms: number | null;
  is_alerting: boolean;
  alert_count: number;
  created_at: string;
  updated_at: string;
}

export interface ServiceCheckResult {
  id: number;
  check_id: number;
  agent_hostname: string;
  is_success: boolean;
  latency_ms: number | null;
  status_code: number | null;
  response_body: string | null;
  error_message: string | null;
  check_time: string;
}

export interface DailyUptime {
  date: string;
  total: number;
  success: number;
  failure: number;
  uptime_pct: number | null;
}

export interface UptimeStats {
  total_checks: number;
  successful_checks: number;
  failed_checks: number;
  uptime_pct: number | null;
  period_hours: number;
}

export interface ServiceCheckSummary {
  total: number;
  passing: number;
  failing: number;
  unknown: number;
}

export interface ServiceCheckCreate {
  name: string;
  description?: string;
  check_type: ServiceCheckType;
  target: string;
  expected_status_code?: number;
  expected_content?: string;
  proxy_address?: string;
  dns_server?: string;
  expected_ip?: string;
  dns_record_type?: string;
  timeout_seconds?: number;
  interval_seconds?: number;
  failure_threshold?: number;
  alert_interval_hours?: number;
  assigned_agent?: string;
}

export interface ServiceCheckUpdate extends Partial<ServiceCheckCreate> {
  is_enabled?: boolean;
}

export interface AvailableAgent {
  hostname: string;
  status: string;
  description?: string;
  last_seen?: string | null;
}

export interface CheckTypeInfo {
  id: ServiceCheckType;
  name: string;
  description: string;
}

// Agent Version types
export interface AgentVersion {
  id: number;
  version: string;
  sha256: string;
  dependencies: string[];
  release_notes: string | null;
  is_current: boolean;
  is_deprecated: boolean;
  published_at: string;
  created_at: string;
}

export interface AgentUpdateHistory {
  id: number;
  agent_hostname: string;
  from_version: string;
  to_version: string;
  success: boolean;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface AgentRolloutStatus {
  current_version: string | null;
  version_distribution: Array<{
    version: string;
    count: number;
    percentage: number;
  }>;
  agents_needing_update: number;
  total_agents: number;
}

// Network Monitoring Types

export interface NetworkStatus {
  enabled: boolean;
  cloudflare_radar_available: boolean;
  observium_available: boolean;
  asn: number;
  monitored_interfaces: string[];
}

export interface BGPEvent {
  id: number;
  event_type: string;
  asn: number;
  prefix: string | null;
  as_path: string | null;
  origin_asn: number | null;
  peer_asn: number | null;
  peer_name: string | null;
  peer_state: string | null;
  description: string | null;
  severity: string | null;
  event_time: string;
  alert_sent: boolean;
}

export interface BGPPrefixStatus {
  id: number;
  asn: number;
  prefix: string;
  is_visible: boolean;
  visibility_count: number | null;
  as_path: string | null;
  origin_asn: number | null;
  first_seen: string;
  last_seen: string;
}

export interface BGPSummary {
  asn: number;
  prefix_count: number;
  prefixes: Array<{
    prefix: string;
    is_visible: boolean;
    first_seen: string | null;
    last_seen: string | null;
  }>;
  recent_events_24h: number;
  event_counts: Record<string, number>;
  api_overview: Record<string, unknown> | null;
}

export interface TrafficSample {
  id: number;
  interface_name: string;
  device_hostname: string | null;
  traffic_in: number;
  traffic_out: number;
  interface_speed: number | null;
  utilization_in: number | null;
  utilization_out: number | null;
  sample_time: string;
}

export interface DailyTrafficSummary {
  id: number;
  interface_name: string;
  device_hostname: string | null;
  date: string;
  total_in_bytes: number;
  total_out_bytes: number;
  peak_in: number | null;
  peak_out: number | null;
  avg_in: number | null;
  avg_out: number | null;
  sample_count: number;
}

export interface InterfaceStats {
  interface_name: string;
  port_id: number | null;
  ifSpeed: number | null;
  ifOperStatus: string | null;
  ifAdminStatus: string | null;
  ifInOctets_rate: number | null;
  ifOutOctets_rate: number | null;
  ifInOctets_perc: number | null;
  ifOutOctets_perc: number | null;
  last_sample_time: string | null;
  device_hostname: string | null;
  error: string | null;
}

export interface TrafficSummary {
  interfaces: InterfaceStats[];
  daily_totals: Array<{
    interface_name: string;
    total_in_bytes: number;
    total_out_bytes: number;
    peak_in: number | null;
    peak_out: number | null;
    sample_count: number;
  }>;
  active_alerts: number;
  monitoring_interfaces: string[];
}

export interface ObserviumAlert {
  id: number;
  observium_alert_id: number | null;
  device_hostname: string | null;
  entity_type: string | null;
  entity_name: string | null;
  alert_status: string;
  severity: string | null;
  message: string | null;
  alert_time: string;
  resolved_time: string | null;
}

export interface TrafficGraphData {
  timestamp: string;
  traffic_in: number;
  traffic_out: number;
  utilization_in: number | null;
  utilization_out: number | null;
}
