import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthContext, useAuthProvider } from './hooks/useAuth';
import { useAuth } from './hooks/useAuth';
import { company as companyApi } from './lib/api';
import { DarkModeProvider } from './context/DarkModeContext';
import Layout from './components/layout/Layout';
import LoginPage from './pages/LoginPage';
import OnboardingPage from './pages/OnboardingPage';
import DashboardPage from './pages/DashboardPage';
import OrgChartPage from './pages/OrgChartPage';
import TasksPage from './pages/TasksPage';
import MeetingRoomPage from './pages/MeetingRoomPage';
import MeetingDetailPage from './pages/MeetingDetailPage';
import AgentPage from './pages/AgentPage';
import SettingsPage from './pages/SettingsPage';
import VideoCallPage from './pages/VideoCallPage';
import MeetingSummaryPage from './pages/MeetingSummaryPage';
import JoinPage from './pages/JoinPage';
import SpacePage from './pages/SpacePage';
import AgentSpacePage from './pages/AgentSpacePage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireCompany({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'checking' | 'has-company' | 'no-company'>('checking');

  useEffect(() => {
    companyApi.get()
      .then(() => setStatus('has-company'))
      .catch(() => setStatus('no-company'));
  }, []);

  if (status === 'checking') return (
    <div className="min-h-screen flex items-center justify-center">
      <div
        className="w-8 h-8 border-2 rounded-full animate-spin"
        style={{ borderColor: '#89dba8', borderTopColor: 'transparent' }}
      />
    </div>
  );
  if (status === 'no-company') return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function OnboardingGate() {
  const [status, setStatus] = useState<'checking' | 'has-company' | 'no-company'>('checking');

  useEffect(() => {
    companyApi.get()
      .then(() => setStatus('has-company'))
      .catch(() => setStatus('no-company'));
  }, []);

  if (status === 'checking') return (
    <div className="min-h-screen flex items-center justify-center">
      <div
        className="w-8 h-8 border-2 rounded-full animate-spin"
        style={{ borderColor: '#89dba8', borderTopColor: 'transparent' }}
      />
    </div>
  );
  if (status === 'has-company') return <Navigate to="/dashboard" replace />;
  return <OnboardingPage />;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route path="/join" element={<JoinPage />} />
      <Route path="/onboarding" element={
        <RequireAuth>
          <OnboardingGate />
        </RequireAuth>
      } />
      <Route path="/" element={
        <RequireAuth>
          <RequireCompany>
            <Layout />
          </RequireCompany>
        </RequireAuth>
      }>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="org-chart" element={<OrgChartPage />} />
        <Route path="agents/:id" element={<AgentPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="space" element={<SpacePage />} />
        <Route path="space/:id" element={<AgentSpacePage />} />
        <Route path="meeting-room" element={<MeetingRoomPage />} />
        <Route path="meeting-room/:id" element={<MeetingDetailPage />} />
        <Route path="video-call/:id" element={<VideoCallPage />} />
        <Route path="meetings/:id/summary" element={<MeetingSummaryPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  const auth = useAuthProvider();
  return (
    <AuthContext.Provider value={auth}>
      <DarkModeProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </DarkModeProvider>
    </AuthContext.Provider>
  );
}
