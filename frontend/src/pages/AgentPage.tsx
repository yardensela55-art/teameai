import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { agents as agentsApi } from '../lib/api';
import type { Agent, ChatMessage } from '../types';
import { TaskStatusBadge } from '../components/ui/StatusBadge';
import { ArrowLeft, Send, Loader2 } from 'lucide-react';
import { isChiefOfStaff, COS_GLOW } from '../lib/chiefOfStaff';

export default function AgentPage() {
  const { id } = useParams<{ id: string }>();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    agentsApi.get(id)
      .then(({ agent }) => setAgent(agent))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !id || sending) return;

    const userMessage = input.trim();
    setInput('');
    const newHistory: ChatMessage[] = [...chatHistory, { role: 'user', content: userMessage }];
    setChatHistory(newHistory);
    setSending(true);

    try {
      const { reply } = await agentsApi.chat(id, userMessage, chatHistory);
      setChatHistory([...newHistory, { role: 'assistant', content: reply }]);
    } catch {
      setChatHistory([...newHistory, { role: 'assistant', content: '⚠️ Failed to get a response.' }]);
    } finally {
      setSending(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 size={24} className="animate-spin text-[#3db87a]" />
    </div>
  );

  if (!agent) return <div className="p-8 text-red-600">Agent not found</div>;

  const cos = isChiefOfStaff(agent);
  const agentWithTasks = agent as Agent & { tasks?: { id: string; title: string; status: string }[] };

  return (
    <div className="flex h-full">
      {/* Profile sidebar */}
      <div className="w-72 flex-shrink-0 border-r border-gray-100 p-6 overflow-y-auto bg-white">
        <Link
          to="/settings"
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 mb-6 transition-colors"
        >
          <ArrowLeft size={14} /> Back to Settings
        </Link>

        <img
          src={agent.avatarUrl}
          alt={agent.name}
          className="w-20 h-20 rounded-full object-cover mb-4"
          style={cos ? { boxShadow: COS_GLOW } : {}}
        />
        <h1 className={`text-xl font-bold ${cos ? 'gradient-text' : 'text-gray-900'}`}>
          {cos ? `✦ ${agent.name}` : agent.name}
        </h1>
        <p className="text-green-600 font-medium">{agent.role}</p>
        <p className="text-sm text-gray-500 mt-0.5">{agent.department}</p>

        {agent.age && (
          <p className="text-xs text-gray-400 mt-1">Age {agent.age}</p>
        )}

        {agent.hobby && (
          <p className="text-xs text-gray-500 italic mt-2">🎯 {agent.hobby}</p>
        )}

        {agent.background && (
          <div className="mt-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Background</p>
            <p className="text-sm text-gray-600">{agent.background}</p>
          </div>
        )}

        {agent.personality && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Personality</p>
            <div className="flex flex-wrap gap-1">
              {agent.personality.split(',').map((t, i) => (
                <span key={i} className="badge bg-gray-100 text-gray-600">{t.trim()}</span>
              ))}
            </div>
          </div>
        )}

        {agent.expertise && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Expertise</p>
            <div className="flex flex-wrap gap-1">
              {agent.expertise.split(',').map((s, i) => (
                <span key={i} className="badge bg-green-50 text-green-700">{s.trim()}</span>
              ))}
            </div>
          </div>
        )}

        {agentWithTasks.tasks && agentWithTasks.tasks.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Recent Tasks</p>
            <div className="space-y-2">
              {agentWithTasks.tasks.slice(0, 5).map((task) => (
                <div key={task.id} className="flex items-center gap-2">
                  <TaskStatusBadge status={task.status as 'BACKLOG' | 'IN_PROGRESS' | 'REVIEW' | 'DONE'} />
                  <span className="text-xs text-gray-500 truncate">{task.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Chat */}
      <div className="flex-1 flex flex-col bg-white">
        {/* Chat header */}
        <div className={`flex items-center gap-3 px-6 py-4 border-b border-gray-100 ${cos ? 'bg-green-50/40' : 'bg-white'}`}>
          <img src={agent.avatarUrl} alt={agent.name} className="w-8 h-8 rounded-full object-cover"
            style={cos ? { boxShadow: COS_GLOW } : {}}
          />
          <div>
            <p className={`font-medium ${cos ? 'gradient-text' : 'text-gray-900'}`}>
              {cos ? `✦ ${agent.name}` : agent.name}
            </p>
            <p className="text-xs text-gray-500">{agent.role}</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="w-2 h-2 bg-green-500 rounded-full" />
            <span className="text-xs text-gray-500">Online</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
          {chatHistory.length === 0 && (
            <div className="text-center py-16">
              <img
                src={agent.avatarUrl}
                alt={agent.name}
                className="w-16 h-16 rounded-full object-cover mx-auto mb-4"
              />
              <p className="text-gray-600 font-medium">Start a conversation with {agent.name}</p>
              <p className="text-sm text-gray-400 mt-1">Ask them anything about their work or expertise.</p>
            </div>
          )}

          {chatHistory.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              {msg.role === 'assistant' && (
                <img
                  src={agent.avatarUrl}
                  alt={agent.name}
                  className="w-8 h-8 rounded-full object-cover flex-shrink-0 mt-0.5"
                />
              )}
              <div className={`max-w-[70%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-brand-gradient text-white rounded-tr-sm'
                  : 'bg-gray-100 text-gray-900 rounded-tl-sm'
              }`}>
                {msg.content}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex gap-3">
              <img
                src={agent.avatarUrl}
                alt={agent.name}
                className="w-8 h-8 rounded-full object-cover flex-shrink-0"
              />
              <div className="bg-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={sendMessage} className="px-6 py-4 border-t border-gray-100 bg-white flex gap-3">
          <input
            className="input flex-1"
            placeholder={`Message ${agent.name}…`}
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={sending}
          />
          <button
            type="submit"
            className="btn-primary px-3"
            disabled={sending || !input.trim()}
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
