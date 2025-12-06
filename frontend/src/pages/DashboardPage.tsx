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
        <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 drop-shadow-[0_0_5px_rgba(255,255,255,0.3)]">Dashboard</h1>
        <button
          onClick={loadDashboard}
          className="text-sm text-neon-blue hover:text-white border border-neon-blue/30 hover:border-neon-blue hover:bg-neon-blue/10 px-4 py-2 rounded-lg transition-all duration-300 shadow-[0_0_10px_rgba(0,243,255,0.1)] hover:shadow-[0_0_15px_rgba(0,243,255,0.3)]"
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
          color="purple"
        />
        <StatCard
          icon={AlertTriangle}
          label="Overdue"
          value={data.stats.overdue_count}
          color="pink"
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
        <div className="bg-cyber-gray/80 backdrop-blur-sm rounded-xl border border-white/10 p-5 shadow-glass hover:border-neon-purple/30 transition-colors duration-300">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Clock size={20} className="text-neon-pink drop-shadow-[0_0_5px_rgba(255,0,255,0.5)]" />
              Tasks Due Soon
            </h2>
            <Link
              to="/tasks"
              className="text-sm text-neon-blue hover:text-white transition-colors drop-shadow-[0_0_5px_rgba(0,243,255,0.5)]"
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
                  className="flex items-center justify-between py-2 px-3 bg-black/40 border border-white/5 rounded-lg hover:border-neon-pink/30 transition-colors"
                >
                  <div>
                    <p className="text-sm text-gray-200">{task.title}</p>
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
        <div className="bg-cyber-gray/80 backdrop-blur-sm rounded-xl border border-white/10 p-5 shadow-glass hover:border-neon-blue/30 transition-colors duration-300">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Activity size={20} className="text-neon-blue drop-shadow-[0_0_5px_rgba(0,243,255,0.5)]" />
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
                  className="flex items-center justify-between py-2 px-3 bg-black/40 border border-white/5 rounded-lg hover:border-neon-blue/30 transition-colors"
                >
                  <div>
                    <p className="text-sm text-gray-200">{task.title}</p>
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

        {/* System Health - Link to Monitoring */}
        <div className="bg-cyber-gray/80 backdrop-blur-sm rounded-xl border border-white/10 p-5 shadow-glass hover:border-neon-green/30 transition-colors duration-300">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Server size={20} className="text-neon-green drop-shadow-[0_0_5px_rgba(0,255,157,0.5)]" />
              System Health
            </h2>
            <Link
              to="/monitoring"
              className="text-sm text-neon-blue hover:text-white transition-colors drop-shadow-[0_0_5px_rgba(0,243,255,0.5)]"
            >
              View all
            </Link>
          </div>
          <div className="text-center py-6">
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-neon-green/10 border border-neon-green/30 flex items-center justify-center mx-auto mb-2 shadow-[0_0_15px_rgba(0,255,157,0.2)]">
                  <Server size={24} className="text-neon-green" />
                </div>
                <p className="text-sm text-gray-400">Monitoring</p>
                <p className="text-xs text-neon-green drop-shadow-[0_0_5px_rgba(0,255,157,0.5)]">Active</p>
              </div>
            </div>
            <Link
              to="/monitoring"
              className="inline-flex items-center gap-2 px-4 py-2 bg-black/40 hover:bg-neon-green/10 text-gray-300 hover:text-neon-green border border-white/10 hover:border-neon-green/50 rounded-lg transition-all duration-300 text-sm"
            >
              <Activity size={16} />
              Open Monitoring Dashboard
            </Link>
          </div>
        </div>

        {/* Ansible Jobs Placeholder */}
        <div className="bg-cyber-gray/80 backdrop-blur-sm rounded-xl border border-white/10 p-5 shadow-glass opacity-70">
          <div className="flex items-center gap-2 mb-4">
            <Terminal size={20} className="text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-500">
              Recent Ansible Jobs
            </h2>
            <span className="ml-auto text-xs bg-black/40 text-gray-500 px-2 py-1 rounded border border-white/5">
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
  color: 'blue' | 'purple' | 'pink' | 'green';
}) {
  const colorClasses = {
    blue: 'text-neon-blue bg-neon-blue/10 border-neon-blue/30 shadow-[0_0_15px_rgba(0,243,255,0.2)]',
    purple: 'text-neon-purple bg-neon-purple/10 border-neon-purple/30 shadow-[0_0_15px_rgba(157,0,255,0.2)]',
    pink: 'text-neon-pink bg-neon-pink/10 border-neon-pink/30 shadow-[0_0_15px_rgba(255,0,255,0.2)]',
    green: 'text-neon-green bg-neon-green/10 border-neon-green/30 shadow-[0_0_15px_rgba(0,255,157,0.2)]',
  };

  return (
    <div className="bg-cyber-gray/80 backdrop-blur-sm rounded-xl border border-white/10 p-5 shadow-glass hover:bg-cyber-gray transition-colors duration-300 group">
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-lg border ${colorClasses[color]} transition-all duration-300 group-hover:scale-110`}>
          <Icon size={24} />
        </div>
        <div>
          <p className="text-2xl font-bold text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.3)]">{value}</p>
          <p className="text-sm text-gray-400">{label}</p>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    todo: 'bg-gray-800/50 text-gray-400 border-gray-700',
    in_progress: 'bg-neon-purple/10 text-neon-purple border-neon-purple/30 shadow-[0_0_10px_rgba(157,0,255,0.2)]',
    done: 'bg-neon-green/10 text-neon-green border-neon-green/30 shadow-[0_0_10px_rgba(0,255,157,0.2)]',
  };

  const labels: Record<string, string> = {
    todo: 'To Do',
    in_progress: 'In Progress',
    done: 'Done',
  };

  return (
    <span className={`text-xs px-2 py-1 rounded border ${colors[status] || colors.todo}`}>
      {labels[status] || status}
    </span>
  );
}
