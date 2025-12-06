import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  LayoutDashboard,
  CheckSquare,
  Key,
  FileText,
  LogOut,
  Server,
  Cpu,
} from 'lucide-react';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
    { to: '/tasks', icon: CheckSquare, label: 'Tasks' },
    { to: '/passwords', icon: Key, label: 'Passwords' },
    { to: '/documents', icon: FileText, label: 'Documents' },
    { to: '/monitoring', icon: Server, label: 'Monitoring' },
    // Placeholder for v2
    { to: '#', icon: Cpu, label: 'Automation', disabled: true },
  ];

  return (
    <div className="min-h-screen bg-gray-950 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-xl font-bold text-blue-400">Situation Room</h1>
        </div>

        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {navItems.map((item) => (
              <li key={item.label}>
                {item.disabled ? (
                  <span className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 cursor-not-allowed">
                    <item.icon size={20} />
                    <span>{item.label}</span>
                    <span className="ml-auto text-xs bg-gray-800 px-2 py-0.5 rounded">
                      v2
                    </span>
                  </span>
                ) : (
                  <NavLink
                    to={item.to}
                    end={item.exact}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                      }`
                    }
                  >
                    <item.icon size={20} />
                    <span>{item.label}</span>
                  </NavLink>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-sm font-medium">
              {user?.username?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user?.username}
              </p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
