import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { agents as agentsApi, tasks as tasksApi, meetings as meetingsApi, standup as standupApi } from '../lib/api';
import { isChiefOfStaff, COS_GLOW } from '../lib/chiefOfStaff';
import type { Agent, ChatMessage, Task, Meeting } from '../types';
import { Loader2, ArrowLeft, Send, RefreshCw, CheckCircle2, Circle, Clock, AlertCircle } from 'lucide-react';
import { useDarkMode } from '../context/DarkModeContext';
import TaskSuggestions from '../components/TaskSuggestions';

type Tab = 'now' | 'meetings' | 'history' | 'documents';

const TABS: { id: Tab; label: string }[] = [
  { id: 'now', label: 'Now' },
  { id: 'meetings', label: 'Meetings' },
  { id: 'history', label: 'Chat' },
  { id: 'documents', label: 'Documents' },
];

function statusIcon(status: string) {
  if (status === 'DONE') return <CheckCircle2 size={13} className="text-green-500 flex-shrink-0" />;
  if (status === 'IN_PROGRESS') return <Clock size={13} className="text-blue-500 flex-shrink-0" />;
  if (status === 'REVIEW') return <AlertCircle size={13} className="text-yellow-500 flex-shrink-0" />;
  return <Circle size={13} className="text-gray-300 flex-shrink-0" />;
}

export default function AgentSpacePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isDark } = useDarkMode();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('now');

  // Now tab
  const [standup, setStandup] = useState<{ completed: string; workingOn: string; blockers: string } | null>(null);
  const [standupLoading, setStandupLoading] = useState(false);
  const [agentTasks, setAgentTasks] = useState<Task[]>([]);

  // Meetings tab
  const [meetingsList, setMeetingsList] = useState<Meeting[]>([]);
  const [meetingsLoading, setMeetingsLoading] = useState(false);
  const [meetingsLoaded, setMeetingsLoaded] = useState(false);

  // Chat tab
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      agentsApi.get(id),
      tasksApi.list({ agentId: id }),
    ])
      .then(([{ agent: a }, { tasks: t }]) => {
        setAgent(a);
        setAgentTasks(t);
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const generateStandup = async () => {
    if (!id || standupLoading) return;
    setStandupLoading(true);
    try {
      const { standup: s } = await standupApi.generate(id);
      setStandup(s);
    } catch {
      // ignore
    } finally {
      setStandupLoading(false);
    }
  };

  const loadMeetings = async () => {
    if (meetingsLoaded || meetingsLoading) return;
    setMeetingsLoading(true);
    try {
      const { meetings } = await meetingsApi.list();
      setMeetingsList(meetings.filter(m => m.slots.some(s => s.agentId === id)));
      setMeetingsLoaded(true);
    } finally {
      setMeetingsLoading(false);
    }
  };

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    if (tab === 'meetings') loadMeetings();
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !id || chatSending) return;
    const msg = chatInput.trim();
    setChatInput('');
    const next: ChatMessage[] = [...chatHistory, { role: 'user', content: msg }];
    setChatHistory(next);
    setChatSending(true);
    try {
      const { reply } = await agentsApi.chat(id, msg, chatHistory);
      setChatHistory([...next, { role: 'assistant', content: reply }]);
    } catch {
      setChatHistory([...next, { role: 'assistant', content: '⚠️ Failed to get a response.' }]);
    } finally {
      setChatSending(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 size={28} className="animate-spin" style={{ color: '#89dba8' }} />
    </div>
  );
  if (!agent) return <div className="p-8 text-red-500 text-sm">Agent not found</div>;

  const cos = isChiefOfStaff(agent);
  const border = isDark ? 'border-[#2A2A2A]' : 'border-gray-100';
  const bg = isDark ? 'bg-[#1A1A1A]' : 'bg-white';
  const textPrimary = isDark ? 'text-white' : 'text-gray-900';
  const textSecondary = isDark ? 'text-gray-400' : 'text-gray-500';
  const textMuted = isDark ? 'text-gray-600' : 'text-gray-400';

  return (
    <div className={`flex h-full ${isDark ? 'bg-[#0F0F0F]' : 'bg-white'}`}>
      {/* LEFT — Profile */}
      <aside className={`w-64 flex-shrink-0 border-r ${border} ${isDark ? 'bg-[#111111]' : 'bg-white'} flex flex-col overflow-y-auto`}>
        <div className="p-6">
          <button
            onClick={() => navigate('/space')}
            className={`flex items-center gap-2 text-sm mb-6 transition-colors ${isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <ArrowLeft size={14} /> Space
          </button>

          <div className="flex flex-col items-center text-center mb-6">
            <div className="relative mb-4">
              <img
                src={agent.avatarUrl}
                alt={agent.name}
                className="w-20 h-20 rounded-full object-cover"
                style={cos ? { boxShadow: COS_GLOW } : {}}
              />
              <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-400 rounded-full border-2 ${isDark ? 'border-[#111111]' : 'border-white'}`} />
            </div>
            <h1 className={`text-lg font-bold ${cos ? 'gradient-text' : textPrimary}`}>
              {cos ? `✦ ${agent.name}` : agent.name}
            </h1>
            <p className="text-sm font-medium text-green-500 mt-0.5">{agent.role}</p>
            {agent.department && (
              <p className={`text-xs mt-0.5 ${textMuted}`}>{agent.department}</p>
            )}
          </div>

          <div className="space-y-4 text-left">
            {agent.bio && (
              <div>
                <p className={`text-xs font-semibold uppercase tracking-widest mb-1.5 ${textMuted}`}>Bio</p>
                <p className={`text-xs leading-relaxed ${textSecondary}`}>{agent.bio}</p>
              </div>
            )}
            {agent.background && (
              <div>
                <p className={`text-xs font-semibold uppercase tracking-widest mb-1.5 ${textMuted}`}>Background</p>
                <p className={`text-xs leading-relaxed ${textSecondary}`}>{agent.background}</p>
              </div>
            )}
            {agent.personality && (
              <div>
                <p className={`text-xs font-semibold uppercase tracking-widest mb-1.5 ${textMuted}`}>Personality</p>
                <div className="flex flex-wrap gap-1">
                  {agent.personality.split(',').map(t => t.trim()).filter(Boolean).map(trait => (
                    <span
                      key={trait}
                      className={`text-xs px-2 py-0.5 rounded-full border ${isDark ? 'border-[#2A2A2A] text-gray-400' : 'border-gray-100 text-gray-500'}`}
                    >
                      {trait}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {agent.expertise && (
              <div>
                <p className={`text-xs font-semibold uppercase tracking-widest mb-1.5 ${textMuted}`}>Expertise</p>
                <p className={`text-xs leading-relaxed ${textSecondary}`}>{agent.expertise}</p>
              </div>
            )}
            {agent.hobby && (
              <div>
                <p className={`text-xs font-semibold uppercase tracking-widest mb-1.5 ${textMuted}`}>Outside work</p>
                <p className={`text-xs ${textSecondary}`}>{agent.hobby}</p>
              </div>
            )}
            {agent.age && (
              <div>
                <p className={`text-xs font-semibold uppercase tracking-widest mb-1.5 ${textMuted}`}>Age</p>
                <p className={`text-xs ${textSecondary}`}>{agent.age}</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* RIGHT — Work Hub */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Tab bar */}
        <div className={`flex items-center gap-1 px-6 pt-5 pb-0 border-b ${border} flex-shrink-0`}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? isDark
                    ? 'text-green-400 border-green-400'
                    : 'text-green-700 border-green-500'
                  : isDark
                    ? 'text-gray-500 border-transparent hover:text-gray-300'
                    : 'text-gray-400 border-transparent hover:text-gray-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* NOW TAB */}
          {activeTab === 'now' && (
            <div className="max-w-2xl space-y-6">
              {/* Standup card */}
              <div className={`rounded-2xl border ${border} ${bg} p-5`}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className={`font-semibold text-sm ${textPrimary}`}>Daily Standup</h3>
                  <button
                    onClick={generateStandup}
                    disabled={standupLoading}
                    className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                      isDark ? 'bg-[#2A2A2A] text-gray-400 hover:text-gray-200' : 'bg-gray-50 text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <RefreshCw size={11} className={standupLoading ? 'animate-spin' : ''} />
                    {standup ? 'Refresh' : 'Generate'}
                  </button>
                </div>

                {!standup && !standupLoading && (
                  <p className={`text-xs ${textMuted}`}>Click Generate to create today's standup update.</p>
                )}
                {standupLoading && (
                  <div className="flex items-center gap-2 py-2">
                    <Loader2 size={14} className="animate-spin text-green-500" />
                    <p className={`text-xs ${textMuted}`}>Generating standup…</p>
                  </div>
                )}
                {standup && (
                  <div className="space-y-4">
                    <div>
                      <p className={`text-xs font-semibold uppercase tracking-widest mb-1.5 ${textMuted}`}>✅ Completed</p>
                      <p className={`text-sm leading-relaxed ${textSecondary}`}>{standup.completed}</p>
                    </div>
                    <div>
                      <p className={`text-xs font-semibold uppercase tracking-widest mb-1.5 ${textMuted}`}>🔄 Working on</p>
                      <p className={`text-sm leading-relaxed ${textSecondary}`}>{standup.workingOn}</p>
                    </div>
                    <div>
                      <p className={`text-xs font-semibold uppercase tracking-widest mb-1.5 ${textMuted}`}>🚧 Blockers</p>
                      <p className={`text-sm leading-relaxed ${textSecondary}`}>{standup.blockers}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Tasks */}
              <div className={`rounded-2xl border ${border} ${bg} p-5`}>
                <h3 className={`font-semibold text-sm mb-4 ${textPrimary}`}>
                  Assigned Tasks
                  <span className={`ml-2 text-xs font-normal ${textMuted}`}>{agentTasks.length}</span>
                </h3>
                {agentTasks.length === 0 ? (
                  <p className={`text-xs ${textMuted}`}>No tasks assigned.</p>
                ) : (
                  <div className="space-y-2">
                    {agentTasks.map(task => (
                      <div key={task.id} className={`flex items-start gap-3 p-3 rounded-xl ${isDark ? 'bg-[#111111]' : 'bg-gray-50'}`}>
                        {statusIcon(task.status)}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium leading-tight ${textPrimary}`}>{task.title}</p>
                          {task.description && (
                            <p className={`text-xs mt-0.5 line-clamp-2 ${textMuted}`}>{task.description}</p>
                          )}
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium ${
                          task.priority === 'HIGH' ? 'bg-red-100 text-red-600' :
                          task.priority === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          {task.priority}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Agent-specific task suggestions */}
              <TaskSuggestions
                agentId={id}
                onTaskCreated={() => {
                  tasksApi.list({ agentId: id! }).then(({ tasks }) => setAgentTasks(tasks)).catch(() => {});
                }}
              />
            </div>
          )}

          {/* MEETINGS TAB */}
          {activeTab === 'meetings' && (
            <div className="max-w-2xl">
              {meetingsLoading ? (
                <div className="flex items-center gap-2 py-4">
                  <Loader2 size={16} className="animate-spin text-green-500" />
                  <p className={`text-sm ${textMuted}`}>Loading meetings…</p>
                </div>
              ) : meetingsList.length === 0 ? (
                <p className={`text-sm ${textMuted}`}>{agent.name} hasn't been in any meetings yet.</p>
              ) : (
                <div className="space-y-3">
                  {meetingsList.map(meeting => (
                    <div
                      key={meeting.id}
                      className={`rounded-2xl border ${border} ${bg} p-4 flex items-start gap-4`}
                    >
                      <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                        meeting.status === 'COMPLETED' ? 'bg-green-400' :
                        meeting.status === 'IN_PROGRESS' ? 'bg-blue-400' : 'bg-gray-300'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${textPrimary}`}>{meeting.title}</p>
                        <p className={`text-xs mt-0.5 ${textMuted}`}>
                          {new Date(meeting.scheduledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                        {meeting.agenda.length > 0 && (
                          <p className={`text-xs mt-1 ${textSecondary} truncate`}>{meeting.agenda.join(' · ')}</p>
                        )}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                        meeting.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                        meeting.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                        isDark ? 'bg-[#2A2A2A] text-gray-400' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {meeting.status === 'IN_PROGRESS' ? 'Live' : meeting.status === 'COMPLETED' ? 'Done' : 'Scheduled'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* CHAT TAB */}
          {activeTab === 'history' && (
            <div className="flex flex-col h-full max-w-2xl" style={{ height: 'calc(100vh - 160px)' }}>
              <div className={`flex-1 overflow-y-auto rounded-2xl border ${border} ${bg} p-4 space-y-3 mb-3`}>
                {chatHistory.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                    <img src={agent.avatarUrl} alt={agent.name} className="w-12 h-12 rounded-full mb-3 opacity-60" />
                    <p className={`text-sm ${textMuted}`}>Start a conversation with {agent.name}</p>
                  </div>
                )}
                {chatHistory.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'text-white rounded-br-md'
                        : isDark
                          ? 'bg-[#2A2A2A] text-gray-200 rounded-bl-md'
                          : 'bg-gray-100 text-gray-800 rounded-bl-md'
                    }`}
                    style={msg.role === 'user' ? { background: 'linear-gradient(to right, #89dba8, #a8d97a)' } : {}}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {chatSending && (
                  <div className="flex justify-start">
                    <div className={`px-4 py-3 rounded-2xl rounded-bl-md ${isDark ? 'bg-[#2A2A2A]' : 'bg-gray-100'}`}>
                      <div className="flex gap-1">
                        {[0, 1, 2].map(i => (
                          <div key={i} className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
              <form onSubmit={sendMessage} className="flex gap-2">
                <input
                  className={`flex-1 rounded-xl border px-4 py-2.5 text-sm outline-none transition-colors ${
                    isDark ? 'bg-[#1A1A1A] border-[#2A2A2A] text-white placeholder-gray-600 focus:border-green-600' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-green-400'
                  }`}
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder={`Message ${agent.name}…`}
                  disabled={chatSending}
                />
                <button
                  type="submit"
                  disabled={chatSending || !chatInput.trim()}
                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-opacity disabled:opacity-40"
                  style={{ background: 'linear-gradient(to right, #89dba8, #a8d97a)' }}
                >
                  <Send size={15} className="text-white" />
                </button>
              </form>
            </div>
          )}

          {/* DOCUMENTS TAB */}
          {activeTab === 'documents' && (
            <div className="max-w-2xl flex flex-col items-center justify-center py-20 text-center">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${isDark ? 'bg-[#1A1A1A]' : 'bg-gray-50'}`}>
                <span className="text-2xl">📄</span>
              </div>
              <p className={`text-sm font-medium ${textPrimary}`}>Documents coming soon</p>
              <p className={`text-xs mt-1 ${textMuted}`}>Files, reports, and outputs from {agent.name} will appear here.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
