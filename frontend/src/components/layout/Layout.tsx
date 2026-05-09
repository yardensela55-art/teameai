import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, CheckSquare, Calendar, Settings, LogOut, Users, LayoutGrid } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { agents as agentsApi } from '../../lib/api';
import { isChiefOfStaff, COS_GLOW } from '../../lib/chiefOfStaff';
import type { Agent } from '../../types';
import clsx from 'clsx';
import FloatingBar from '../FloatingBar';
import ChatDrawer from '../ChatDrawer';
import { useDarkMode } from '../../context/DarkModeContext';

function MoonIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="moonGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#89dba8" />
          <stop offset="100%" stopColor="#a8d97a" />
        </linearGradient>
      </defs>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="url(#moonGrad)" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="sunGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#89dba8" />
          <stop offset="100%" stopColor="#a8d97a" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="4.5" fill="url(#sunGrad)" />
      <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
        stroke="url(#sunGrad)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/tasks', icon: CheckSquare, label: 'Tasks' },
  { to: '/space', icon: LayoutGrid, label: 'Space' },
  { to: '/meeting-room', icon: Calendar, label: 'Calendar' },
  { to: '/org-chart', icon: Users, label: 'Team' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { isDark, toggle } = useDarkMode();
  const [chatOpen, setChatOpen] = useState(false);
  const [chatPreSelectId, setChatPreSelectId] = useState<string | null>(null);
  const [chatInitialMessage, setChatInitialMessage] = useState<string | null>(null);
  const [alex, setAlex] = useState<Agent | null>(null);

  const fetchAlex = () => {
    agentsApi.list()
      .then(({ agents }) => {
        const cos = agents.find(isChiefOfStaff);
        setAlex(cos ?? null);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchAlex();
    window.addEventListener('teame:agents-changed', fetchAlex);
    return () => window.removeEventListener('teame:agents-changed', fetchAlex);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const { agentId, message } = (e as CustomEvent<{ agentId: string; message: string }>).detail;
      setChatPreSelectId(agentId);
      setChatInitialMessage(message);
      setChatOpen(true);
    };
    window.addEventListener('teame:open-chat', handler);
    return () => window.removeEventListener('teame:open-chat', handler);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const openAlexChat = () => {
    if (!alex) return;
    setChatPreSelectId(alex.id);
    setChatOpen(true);
  };

  return (
    <div className={`flex h-screen overflow-hidden transition-colors duration-300 ${isDark ? 'bg-[#0F0F0F]' : 'bg-white'}`}>
      {/* Sidebar */}
      <aside className={`w-60 flex-shrink-0 flex flex-col border-r transition-colors duration-300 ${
        isDark ? 'bg-[#111111] border-[#1E1E1E]' : 'bg-white border-gray-100'
      }`}>
        {/* Logo */}
        <div className={`flex items-center px-5 py-5 border-b transition-colors duration-300 ${isDark ? 'border-[#1E1E1E]' : 'border-gray-100'}`}>
          <span className="gradient-text text-2xl font-bold tracking-tight">Teame</span>
        </div>

        {/* Alex pinned strip (Founder Mode only) */}
        {alex && (
          <button
            onClick={openAlexChat}
            className={`flex items-center gap-2.5 px-4 py-3 border-b w-full text-left transition-colors group ${
              isDark ? 'border-[#1E1E1E] hover:bg-[#1A1A1A]' : 'border-gray-100 hover:bg-green-50'
            }`}
          >
            <div className="relative flex-shrink-0">
              <img
                src={alex.avatarUrl}
                alt={alex.name}
                className="w-8 h-8 rounded-full object-cover"
                style={{ boxShadow: COS_GLOW }}
              />
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold gradient-text leading-tight truncate">
                ✦ {alex.name}
              </p>
              <p className={`text-xs leading-tight truncate ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{alex.role}</p>
            </div>
          </button>
        )}

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                  isActive
                    ? isDark
                      ? 'bg-green-900/30 text-green-400 font-semibold'
                      : 'bg-green-50 text-green-700 font-semibold'
                    : isDark
                      ? 'text-gray-400 hover:text-gray-200 hover:bg-[#1A1A1A] font-medium'
                      : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50 font-medium'
                )
              }
              style={({ isActive }) =>
                isActive ? { borderLeft: '3px solid #89dba8', paddingLeft: '9px' } : {}
              }
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className={`px-3 py-4 border-t transition-colors duration-300 ${isDark ? 'border-[#1E1E1E]' : 'border-gray-100'}`}>
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
            <div className="w-8 h-8 rounded-full gradient-bg flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>{user?.name}</p>
              <p className="text-xs font-semibold gradient-text truncate">Owner</p>
            </div>
            <button
              onClick={handleLogout}
              className={`transition-colors ${isDark ? 'text-gray-600 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
              title="Sign out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className={`flex-1 overflow-y-auto transition-colors duration-300 ${isDark ? 'bg-[#0F0F0F]' : 'bg-white'}`}>
        <Outlet />
      </main>

      <FloatingBar onChatOpen={() => { setChatPreSelectId(null); setChatOpen(true); }} />

      {/* Dark mode toggle — far right */}
      <button
        onClick={toggle}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        className="fixed bottom-6 right-6 w-10 h-10 rounded-full flex items-center justify-center z-30 transition-all duration-300 hover:scale-110 active:scale-95"
        style={{
          backgroundColor: isDark ? '#1A1A1A' : '#ffffff',
          boxShadow: isDark
            ? '0 4px 20px rgba(0,0,0,0.6), 0 0 0 1px #2A2A2A'
            : '0 4px 20px rgba(0,0,0,0.15), 0 0 0 1px #E5E7EB',
        }}
      >
        {isDark ? <SunIcon /> : <MoonIcon />}
      </button>

      <ChatDrawer
        isOpen={chatOpen}
        onClose={() => { setChatOpen(false); setChatPreSelectId(null); setChatInitialMessage(null); }}
        initialAgentId={chatPreSelectId ?? undefined}
        initialMessage={chatInitialMessage ?? undefined}
      />
    </div>
  );
}
