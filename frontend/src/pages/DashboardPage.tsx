import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { dashboardApi } from '../services/api';
import type { DashboardData } from '../types';
import {
  CheckSquare,
  Clock,
  AlertTriangle,
  TrendingUp,
  Activity,
  Server,
  Terminal,
} from 'lucide-react';

const priorityColors: Record<string, string> = {
  low: 'text-gray-400',
  medium: 'text-blue-400',
  high: 'text-amber-400',
  urgent: 'text-red-400',
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setIsLoading(true);
      const dashboardData = await dashboardApi.get();
      setData(dashboardData);
    } catch {
      setError('Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <div className="text-gray-400">Loading dashboard...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg">
          {error || 'Failed to load dashboard'}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <button
          onClick={loadDashboard}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={CheckSquare}
          label="Total Tasks"
          value={data.stats.total_tasks}
          color="blue"
        />
        <StatCard
          icon={Clock}
          label="In Progress"
          value={data.stats.in_progress_count}
          color="amber"
        />
        <StatCard
          icon={AlertTriangle}
          label="Overdue"
          value={data.stats.overdue_count}
          color="red"
        />
        <StatCard
          icon={TrendingUp}
          label="My Tasks"
          value={data.stats.my_tasks_count}
          color="green"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tasks Due Soon */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Clock size={20} className="text-amber-400" />
              Tasks Due Soon
            </h2>
            <Link
              to="/tasks"
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              View all
            </Link>
          </div>
          {data.tasks_due_soon.length === 0 ? (
            <p className="text-gray-500 text-sm">No tasks due soon</p>
          ) : (
            <ul className="space-y-3">
              {data.tasks_due_soon.map((task) => (
                <li
                  key={task.id}
                  className="flex items-center justify-between py-2 px-3 bg-gray-800/50 rounded-lg"
                >
                  <div>
                    <p className="text-sm text-white">{task.title}</p>
                    <p className="text-xs text-gray-500">
                      {task.due_date
                        ? new Date(task.due_date).toLocaleDateString()
                        : 'No due date'}
                    </p>
                  </div>
                  <span className={`text-xs ${priorityColors[task.priority]}`}>
                    {task.priority}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Activity size={20} className="text-blue-400" />
              Recent Tasks
            </h2>
          </div>
          {data.recent_tasks.length === 0 ? (
            <p className="text-gray-500 text-sm">No recent tasks</p>
          ) : (
            <ul className="space-y-3">
              {data.recent_tasks.map((task) => (
                <li
                  key={task.id}
                  className="flex items-center justify-between py-2 px-3 bg-gray-800/50 rounded-lg"
                >
                  <div>
                    <p className="text-sm text-white">{task.title}</p>
                    <p className="text-xs text-gray-500">
                      {task.assignee || 'Unassigned'}
                    </p>
                  </div>
                  <StatusBadge status={task.status} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* System Health Placeholder */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Server size={20} className="text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-500">
              System Health
            </h2>
            <span className="ml-auto text-xs bg-gray-800 text-gray-500 px-2 py-1 rounded">
              Coming in v2
            </span>
          </div>
          <div className="text-center py-8 text-gray-600">
            <Server size={40} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">
              Prometheus integration and system metrics will be available in v2
            </p>
          </div>
        </div>

        {/* Ansible Jobs Placeholder */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Terminal size={20} className="text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-500">
              Recent Ansible Jobs
            </h2>
            <span className="ml-auto text-xs bg-gray-800 text-gray-500 px-2 py-1 rounded">
              Coming in v2
            </span>
          </div>
          <div className="text-center py-8 text-gray-600">
            <Terminal size={40} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">
              Ansible job history and automation controls will be available in
              v2
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof CheckSquare;
  label: string;
  value: number;
  color: 'blue' | 'amber' | 'red' | 'green';
}) {
  const colorClasses = {
    blue: 'text-blue-400 bg-blue-400/10',
    amber: 'text-amber-400 bg-amber-400/10',
    red: 'text-red-400 bg-red-400/10',
    green: 'text-green-400 bg-green-400/10',
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
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    todo: 'bg-gray-700 text-gray-300',
    in_progress: 'bg-amber-500/20 text-amber-400',
    done: 'bg-green-500/20 text-green-400',
  };

  const labels: Record<string, string> = {
    todo: 'To Do',
    in_progress: 'In Progress',
    done: 'Done',
  };

  return (
    <span className={`text-xs px-2 py-1 rounded ${colors[status] || colors.todo}`}>
      {labels[status] || status}
    </span>
  );
}
