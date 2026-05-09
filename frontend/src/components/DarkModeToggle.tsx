import { useDarkMode } from '../context/DarkModeContext';

export default function DarkModeToggle() {
  const { isDark, toggle } = useDarkMode();

  return (
    <button
      onClick={toggle}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="fixed bottom-24 right-5 z-40 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95"
      style={{
        backgroundColor: isDark ? '#1A1A1A' : '#ffffff',
        boxShadow: isDark
          ? '0 4px 20px rgba(0,0,0,0.6), 0 0 0 1px #2A2A2A'
          : '0 4px 20px rgba(0,0,0,0.12), 0 0 0 1px #E5E7EB',
      }}
    >
      <span
        className="text-xl leading-none"
        style={{
          background: 'linear-gradient(to right, #89dba8, #a8d97a)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          filter: 'none',
        }}
      >
        {isDark ? '☀️' : '🌙'}
      </span>
    </button>
  );
}
