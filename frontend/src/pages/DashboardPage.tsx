import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dashboard as dashboardApi, agents as agentsApi } from '../lib/api';
import type { DashboardData, Task } from '../types';
import { TaskStatusBadge } from '../components/ui/StatusBadge';
import PriorityBadge from '../components/ui/PriorityBadge';
import { CheckSquare, Users, CalendarDays, TrendingUp, Loader2, X, Sparkles, RefreshCw } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { isChiefOfStaff, COS_GLOW } from '../lib/chiefOfStaff';
import TaskSuggestions from '../components/TaskSuggestions';

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, borderColor }: {
  icon: React.ReactNode; label: string; value: number; sub: string; borderColor: string;
}) {
  return (
    <div className={`card p-5 border-l-4 ${borderColor}`}>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}

// ── Main DashboardPage ────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Briefing state
  const [briefingPoints, setBriefingPoints] = useState<string[]>([]);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingAgent, setBriefingAgent] = useState<{ name: string; avatarUrl: string } | null>(null);
  const [newlyCreatedTasks, setNewlyCreatedTasks] = useState<Task[]>([]);

  // Proactive suggestion state
  const [proactiveSuggestion, setProactiveSuggestion] = useState<string | null>(null);
  const [proactiveAgent, setProactiveAgent] = useState<{ name: string; avatarUrl: string } | null>(null);
  const [briefingTasksCreated, setBriefingTasksCreated] = useState(false);

  useEffect(() => {
    dashboardApi.get()
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Morning briefing via /agents/briefing endpoint
  useEffect(() => {
    if (!data) return;

    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `teame_briefing_v3_${today}`;
    const cached = localStorage.getItem(cacheKey);

    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { briefingPoints: string[]; agentName: string; agentAvatar: string };
        setBriefingPoints(parsed.briefingPoints);
        setBriefingAgent({ name: parsed.agentName, avatarUrl: parsed.agentAvatar });
        return;
      } catch { /* ignore */ }
    }

    setBriefingLoading(true);

    // First load of day: create tasks. Subsequent: briefing only.
    const shouldCreateTasks = !localStorage.getItem(`teame_tasks_created_${today}`);

    agentsApi.briefing(shouldCreateTasks)
      .then(({ briefing: b, briefingPoints: bp, createdTasks, agentName, agentAvatar }) => {
        const points = (bp && bp.length > 0) ? bp : [b];
        setBriefingPoints(points);
        setBriefingAgent({ name: agentName, avatarUrl: agentAvatar });

        if (createdTasks.length > 0) {
          setNewlyCreatedTasks(createdTasks as Task[]);
          localStorage.setItem(`teame_tasks_created_${today}`, '1');
          setBriefingTasksCreated(true);
          // Refresh dashboard data to show new tasks
          dashboardApi.get().then(setData).catch(() => {});
        }

        localStorage.setItem(cacheKey, JSON.stringify({ briefingPoints: points, agentName, agentAvatar }));
      })
      .catch(() => {
        // Fallback to simple chat
        const alex = data.agents.find(a => isChiefOfStaff(a));
        if (!alex) return;
        const prompt = `You are giving a morning briefing for ${data.company.name}. Give 4 short bullet points (each under 10 words) about priorities and momentum. Be direct.`;
        agentsApi.chat(alex.id, prompt, [])
          .then(({ reply }) => setBriefingPoints([reply]))
          .catch(() => {});
      })
      .finally(() => setBriefingLoading(false));
  }, [data]);

  // Check for proactive suggestion (every 3 completed tasks)
  useEffect(() => {
    const lastCheck = localStorage.getItem('teame_proactive_check');
    const today = new Date().toISOString().split('T')[0];
    if (lastCheck === today) return;

    agentsApi.proactiveCheck()
      .then(({ suggestion, doneCount, agentName, agentAvatar }) => {
        if (suggestion && doneCount > 0) {
          setProactiveSuggestion(suggestion);
          if (agentName && agentAvatar) {
            setProactiveAgent({ name: agentName, avatarUrl: agentAvatar });
          }
        }
        localStorage.setItem('teame_proactive_check', today);
      })
      .catch(() => {});
  }, []);

  const handleBriefTeam = async () => {
    setBriefingLoading(true);
    setProactiveSuggestion(null);
    try {
      const { briefing: b, briefingPoints: bp, createdTasks, agentName, agentAvatar } = await agentsApi.briefing(true);
      const points = (bp && bp.length > 0) ? bp : [b];
      setBriefingPoints(points);
      setBriefingAgent({ name: agentName, avatarUrl: agentAvatar });
      if (createdTasks.length > 0) {
        setNewlyCreatedTasks(prev => [...prev, ...(createdTasks as Task[])]);
        setBriefingTasksCreated(true);
        dashboardApi.get().then(setData).catch(() => {});
      }
    } finally {
      setBriefingLoading(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 size={24} className="animate-spin text-[#3db87a]" />
    </div>
  );

  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!data) return null;

  const { company, tasks, meetings, agents } = data;
  const alex = agents.find(a => isChiefOfStaff(a));
  const cosInfo = briefingAgent ?? (alex ? { name: alex.name, avatarUrl: alex.avatarUrl } : null);

  return (
    <div className="p-8 bg-white min-h-full">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{company.name}</h1>
        <p className="text-gray-500 text-sm mt-1 max-w-2xl">{company.vision}</p>
      </div>

      {/* Morning Briefing */}
      {(briefingPoints.length > 0 || briefingLoading) && cosInfo && (
        <div className="mb-6 rounded-2xl p-5 border-2" style={{
          borderColor: 'transparent',
          backgroundImage: 'linear-gradient(white, white), linear-gradient(to right, #89dba8, #a8d97a)',
          backgroundOrigin: 'border-box',
          backgroundClip: 'padding-box, border-box',
        }}>
          <div className="flex items-start gap-4">
            <div className="relative flex-shrink-0">
              <img src={cosInfo.avatarUrl} alt={cosInfo.name} className="w-14 h-14 rounded-full object-cover"
                style={{ boxShadow: COS_GLOW }} />
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                ✦ Morning Briefing · {cosInfo.name}
              </p>
              <h3 className="gradient-text font-bold text-lg leading-tight">
                Good morning, {user?.name?.split(' ')[0]} ☀️
              </h3>
              {briefingLoading ? (
                <div className="flex items-center gap-2 mt-2">
                  <Loader2 size={14} className="animate-spin text-green-500" />
                  <span className="text-sm text-gray-400">Preparing your briefing…</span>
                </div>
              ) : briefingPoints.length > 0 ? (
                <ul className="mt-2 space-y-1.5">
                  {briefingPoints.map((point, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 group">
                      <span className="text-sm text-gray-700 leading-snug flex items-start gap-1.5">
                        <span className="text-[#89dba8] font-bold mt-0.5 flex-shrink-0">·</span>
                        {point}
                      </span>
                      <button
                        onClick={() => {
                          const alexAgent = data.agents.find(a => isChiefOfStaff(a));
                          if (!alexAgent) return;
                          window.dispatchEvent(new CustomEvent('teame:open-chat', {
                            detail: { agentId: alexAgent.id, message: point }
                          }));
                        }}
                        className="text-[#89dba8] hover:text-[#3db87a] font-bold text-base flex-shrink-0 transition-colors"
                        title="Discuss with Alex"
                      >
                        →
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {/* Tasks created by briefing */}
              {briefingTasksCreated && newlyCreatedTasks.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
                    <Sparkles size={11} className="text-[#89dba8]" /> Team briefed — tasks created:
                  </p>
                  {newlyCreatedTasks.map(t => (
                    <div key={t.id} className="flex items-center gap-2 text-xs text-gray-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#89dba8] flex-shrink-0" />
                      <span className="font-medium">{(t as Task & { assignedAgent?: { name: string } }).assignedAgent?.name}</span>
                      <span>→</span>
                      <span>{t.title}</span>
                    </div>
                  ))}
                  <Link to="/tasks" className="text-xs text-[#3db87a] hover:underline mt-1 inline-block">
                    View on Tasks board →
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Proactive suggestion */}
      {proactiveSuggestion && proactiveAgent && (
        <div className="mb-6 rounded-xl border border-amber-100 bg-amber-50 px-5 py-4 flex items-start gap-3">
          <img src={proactiveAgent.avatarUrl} alt={proactiveAgent.name} className="w-9 h-9 rounded-full object-cover flex-shrink-0 mt-0.5"
            style={{ boxShadow: COS_GLOW }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-700 leading-relaxed">{proactiveSuggestion}</p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleBriefTeam}
                disabled={briefingLoading}
                className="text-xs font-semibold text-white px-3 py-1.5 rounded-full hover:opacity-90 transition-opacity"
                style={{ background: 'linear-gradient(to right, #89dba8, #a8d97a)' }}
              >
                {briefingLoading ? <Loader2 size={11} className="animate-spin inline" /> : 'Yes, brief the team'}
              </button>
              <button
                onClick={() => setProactiveSuggestion(null)}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Maybe later
              </button>
            </div>
          </div>
          <button onClick={() => setProactiveSuggestion(null)} className="text-gray-300 hover:text-gray-500">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={<Users size={18} className="text-green-600" />}
          label="Team members"
          value={company.agentCount}
          sub="AI agents"
          borderColor="border-green-400"
        />
        <StatCard
          icon={<CheckSquare size={18} className="text-blue-600" />}
          label="Total tasks"
          value={tasks.total}
          sub={`${tasks.completionRate}% done`}
          borderColor="border-blue-400"
        />
        <StatCard
          icon={<TrendingUp size={18} className="text-yellow-500" />}
          label="In progress"
          value={tasks.counts.IN_PROGRESS ?? 0}
          sub="active tasks"
          borderColor="border-yellow-400"
        />
        <StatCard
          icon={<CalendarDays size={18} className="text-purple-500" />}
          label="Meetings"
          value={meetings.recent.length}
          sub="recent"
          borderColor="border-purple-400"
        />
      </div>

      {/* Suggested Tasks */}
      <div className="card p-6 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="font-semibold text-gray-900">Suggested Tasks</h2>
          <span className="text-xs text-gray-400 ml-1">— click to create &amp; auto-assign</span>
        </div>
        <TaskSuggestions
          onTaskCreated={task => {
            setNewlyCreatedTasks(prev => [...prev, task]);
            dashboardApi.get().then(setData).catch(() => {});
          }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Recent tasks */}
        <div className="lg:col-span-2 card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Recent Tasks</h2>
            <div className="flex items-center gap-3">
              <button
                onClick={() => dashboardApi.get().then(setData).catch(() => {})}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title="Refresh"
              >
                <RefreshCw size={14} />
              </button>
              <Link to="/tasks" className="text-sm text-green-600 hover:text-green-700">View all →</Link>
            </div>
          </div>
          {tasks.recent.length === 0 ? (
            <p className="text-gray-400 text-sm">No tasks yet. <Link to="/tasks" className="text-green-600">Create one →</Link></p>
          ) : (
            <div className="divide-y divide-gray-100">
              {tasks.recent.map(task => {
                const t = task as Task & { assignedAgent?: { name: string; avatarUrl: string } };
                const isGenerating = t.status === 'IN_PROGRESS' && t.assignedAgent && !t.aiOutput;
                return (
                  <div key={task.id} className="flex items-center gap-3 py-2.5 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors">
                    {t.assignedAgent?.avatarUrl && (
                      <img src={t.assignedAgent.avatarUrl} alt={t.assignedAgent.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                      {t.assignedAgent && (
                        <p className="text-xs text-gray-400 flex items-center gap-1">
                          {t.assignedAgent.name}
                          {isGenerating && (
                            <span className="flex items-center gap-1 text-[#3db87a]">
                              <Loader2 size={10} className="animate-spin" /> generating…
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <PriorityBadge priority={task.priority} />
                      <TaskStatusBadge status={task.status} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Team */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Your Team</h2>
            <Link to="/settings" className="text-sm text-green-600 hover:text-green-700">View all →</Link>
          </div>
          <div className="space-y-1">
            {agents.slice(0, 6).map(agent => (
              <Link
                key={agent.id}
                to={`/agents/${agent.id}`}
                className="flex items-center gap-3 hover:bg-gray-50 -mx-2 px-2 py-1.5 rounded-lg transition-colors"
              >
                <img src={agent.avatarUrl} alt={agent.name} className="w-8 h-8 rounded-full object-cover" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{agent.name}</p>
                  <p className="text-xs text-gray-400 truncate">{agent.role}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
