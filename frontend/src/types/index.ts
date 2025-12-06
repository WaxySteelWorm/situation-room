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
