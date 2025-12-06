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
    <div className="min-h-screen bg-cyber-black flex text-gray-100 font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-cyber-dark/90 backdrop-blur-md border-r border-white/10 flex flex-col shadow-glass relative z-10">
        <div className="p-6 border-b border-white/10">
          <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-neon-blue to-neon-purple drop-shadow-[0_0_10px_rgba(0,243,255,0.5)]">
            Situation Room
          </h1>
        </div>

        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {navItems.map((item) => (
              <li key={item.label}>
                {item.disabled ? (
                  <span className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 cursor-not-allowed border border-transparent">
                    <item.icon size={20} />
                    <span>{item.label}</span>
                    <span className="ml-auto text-xs bg-gray-900 px-2 py-0.5 rounded text-gray-500 border border-gray-800">
                      v2
                    </span>
                  </span>
                ) : (
                  <NavLink
                    to={item.to}
                    end={item.exact}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-300 border ${isActive
                        ? 'bg-neon-blue/10 text-neon-blue border-neon-blue/50 shadow-[0_0_15px_rgba(0,243,255,0.3)]'
                        : 'text-gray-400 hover:bg-white/5 hover:text-white border-transparent hover:border-white/10 hover:shadow-[0_0_10px_rgba(255,255,255,0.1)]'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon size={20} className={isActive ? "drop-shadow-[0_0_5px_rgba(0,243,255,0.8)]" : ""} />
                        <span>{item.label}</span>
                      </>
                    )}
                  </NavLink>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-4 border-t border-white/10 bg-cyber-black/20">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-neon-purple to-neon-blue p-[1px] shadow-[0_0_10px_rgba(157,0,255,0.5)]">
              <div className="w-full h-full rounded-full bg-cyber-gray flex items-center justify-center text-sm font-bold text-white">
                {user?.username?.charAt(0).toUpperCase()}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate drop-shadow-[0_0_5px_rgba(255,255,255,0.3)]">
                {user?.username}
              </p>
              <p className="text-xs text-gray-400 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-gray-400 hover:text-neon-pink hover:bg-neon-pink/10 border border-transparent hover:border-neon-pink/30 rounded-lg transition-all duration-300 group"
          >
            <LogOut size={18} className="group-hover:drop-shadow-[0_0_5px_rgba(255,0,255,0.8)]" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto relative">
        {/* Background glow effects */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
          <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-neon-purple/10 rounded-full blur-[100px]"></div>
          <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-neon-blue/10 rounded-full blur-[100px]"></div>
        </div>

        <div className="relative z-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
