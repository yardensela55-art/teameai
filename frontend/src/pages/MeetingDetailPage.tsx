import { useEffect, useState, useRef } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { meetings as meetingsApi, agents as agentsApi } from '../lib/api';
import type { Meeting, MeetingSlot, Agent } from '../types';
import { MeetingStatusBadge } from '../components/ui/StatusBadge';
import {
  ArrowLeft,
  Send,
  Loader2,
  Play,
  MessageSquare,
  Monitor,
  ChevronDown,
  Sparkles,
} from 'lucide-react';

// ── Chat mode types ──────────────────────────────────────────────────────────

interface TranscriptMessage {
  agentId: string;
  agentName: string;
  agentRole: string;
  agentAvatar: string;
  topic: string;
  topicIndex: number;
  content: string;
}

interface ChatFollowupMessage {
  role: 'user' | 'assistant';
  content: string;
  agentName?: string;
  agentAvatar?: string;
}

// ── Presentation mode types ──────────────────────────────────────────────────

interface PresentationFollowupMessage {
  slotId: string;
  role: 'user' | 'assistant';
  content: string;
  agentName?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseTranscript(raw: string[]): TranscriptMessage[] {
  return raw.flatMap(t => {
    try {
      return [JSON.parse(t) as TranscriptMessage];
    } catch {
      return [];
    }
  });
}

function groupByTopic(messages: TranscriptMessage[]): [number, TranscriptMessage[]][] {
  const map = new Map<number, TranscriptMessage[]>();
  for (const msg of messages) {
    const idx = msg.topicIndex ?? 0;
    if (!map.has(idx)) map.set(idx, []);
    map.get(idx)!.push(msg);
  }
  return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const shouldAutoRun = (location.state as { autoRun?: boolean } | null)?.autoRun === true;
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [agentList, setAgentList] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  // Presentation mode state
  const [activeSlot, setActiveSlot] = useState<MeetingSlot | null>(null);
  const [presentationFollowups, setPresentationFollowups] = useState<
    Record<string, PresentationFollowupMessage[]>
  >({});
  const [presQuestion, setPresQuestion] = useState('');
  const [presAsking, setPresAsking] = useState(false);

  // Chat mode state
  const [chatFollowups, setChatFollowups] = useState<ChatFollowupMessage[]>([]);
  const [chatQuestion, setChatQuestion] = useState('');
  const [chatAgentId, setChatAgentId] = useState('');
  const [chatAsking, setChatAsking] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    console.log('[MeetingDetail] Loading meeting', id, '| autoRun:', shouldAutoRun);
    Promise.all([meetingsApi.get(id), agentsApi.list()])
      .then(([{ meeting: loaded }, { agents }]) => {
        setMeeting(loaded);
        setAgentList(agents);
        if (loaded.slots.length > 0) setActiveSlot(loaded.slots[0]);
        const defaultAgent =
          loaded.leadAgentId ||
          (loaded.slots.length > 0 ? loaded.slots[0].agentId : '');
        setChatAgentId(defaultAgent);

        if (shouldAutoRun && loaded.status === 'SCHEDULED') {
          console.log('[MeetingDetail] Auto-running meeting...');
          setRunning(true);
          meetingsApi.run(id)
            .then(({ meeting: updated }) => {
              console.log('[MeetingDetail] Meeting complete, status:', updated.status, 'transcript length:', updated.transcript?.length);
              setMeeting(updated);
              if (updated.slots.length > 0) setActiveSlot(updated.slots[0]);
            })
            .catch(err => console.error('[MeetingDetail] Auto-run failed:', err))
            .finally(() => setRunning(false));
        }
      })
      .finally(() => setLoading(false));
  }, [id, shouldAutoRun]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSlot, presentationFollowups, chatFollowups]);

  const runMeeting = async () => {
    if (!id) return;
    setRunning(true);
    try {
      const { meeting: updated } = await meetingsApi.run(id);
      setMeeting(updated);
      if (updated.slots.length > 0) setActiveSlot(updated.slots[0]);
    } finally {
      setRunning(false);
    }
  };

  // Presentation follow-up
  const askPresFollowup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !activeSlot || !presQuestion.trim() || presAsking) return;
    const q = presQuestion.trim();
    setPresQuestion('');
    setPresAsking(true);
    const key = activeSlot.id;
    const userMsg: PresentationFollowupMessage = { slotId: key, role: 'user', content: q };
    setPresentationFollowups(prev => ({ ...prev, [key]: [...(prev[key] || []), userMsg] }));
    try {
      const { reply, agentName } = await meetingsApi.followup(id, activeSlot.agentId, q);
      const asstMsg: PresentationFollowupMessage = {
        slotId: key,
        role: 'assistant',
        content: reply,
        agentName,
      };
      setPresentationFollowups(prev => ({ ...prev, [key]: [...(prev[key] || []), asstMsg] }));
    } finally {
      setPresAsking(false);
    }
  };

  // Chat follow-up
  const askChatFollowup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !chatAgentId || !chatQuestion.trim() || chatAsking) return;
    const q = chatQuestion.trim();
    setChatQuestion('');
    setChatAsking(true);

    const targetAgent = agentList.find(a => a.id === chatAgentId);
    const userMsg: ChatFollowupMessage = { role: 'user', content: q };
    setChatFollowups(prev => [...prev, userMsg]);

    try {
      const { reply, agentName } = await meetingsApi.followup(id, chatAgentId, q);
      const asstMsg: ChatFollowupMessage = {
        role: 'assistant',
        content: reply,
        agentName,
        agentAvatar: targetAgent?.avatarUrl,
      };
      setChatFollowups(prev => [...prev, asstMsg]);
    } finally {
      setChatAsking(false);
    }
  };

  // ── Loading / not found ────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center h-full min-h-[60vh]">
      <Loader2 size={24} className="animate-spin text-green-500" />
    </div>
  );

  if (!meeting) return (
    <div className="p-8 text-red-500">Meeting not found</div>
  );

  const isChat = meeting.mode === 'CHAT' || !meeting.mode;
  const chatMessages = isChat && meeting.transcript
    ? parseTranscript(meeting.transcript)
    : [];
  const topicGroups = groupByTopic(chatMessages);

  // Attendee agents for follow-up selector
  const meetingAgents: Agent[] = agentList.filter(a =>
    meeting.slots.some(s => s.agentId === a.id)
  );

  // ── Running overlay ────────────────────────────────────────────────────────

  if (running) return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4">
      <Loader2 size={36} className="animate-spin text-green-500" />
      <p className="text-gray-600 font-medium">Generating meeting…</p>
      <p className="text-sm text-gray-400">This may take a minute or two</p>
    </div>
  );

  // ── PRESENTATION MODE ──────────────────────────────────────────────────────

  if (!isChat) {
    return (
      <div className="flex h-full">
        {/* Left: slot navigator */}
        <div className="w-64 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
          <div className="px-4 py-4 border-b border-gray-200">
            <Link
              to="/meeting-room"
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-3 transition-colors"
            >
              <ArrowLeft size={14} /> All meetings
            </Link>
            <h2 className="font-semibold text-gray-900 text-sm leading-snug">{meeting.title}</h2>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <MeetingStatusBadge status={meeting.status} />
              <span className="badge bg-blue-100 text-blue-700 flex items-center gap-1">
                <Monitor size={10} /> Presentation
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {new Date(meeting.scheduledAt).toLocaleDateString()}
            </p>
          </div>

          {meeting.status === 'SCHEDULED' && (
            <div className="px-4 py-3 border-b border-gray-200">
              <button
                className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
                onClick={runMeeting}
                disabled={running}
              >
                <Play size={14} /> Run meeting
              </button>
            </div>
          )}
          {meeting.status === 'COMPLETED' && (
            <div className="px-4 py-3 border-b border-gray-200">
              <button
                className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-white py-2 rounded-full"
                style={{ background: 'linear-gradient(to right, #89dba8, #a8d97a)' }}
                onClick={() => navigate(`/meetings/${id}/summary`)}
              >
                <Sparkles size={14} /> View Summary
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto py-2">
            {meeting.slots.map(slot => (
              <button
                key={slot.id}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  activeSlot?.id === slot.id
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                }`}
                onClick={() => setActiveSlot(slot)}
              >
                <div className="relative flex-shrink-0">
                  <img
                    src={slot.agent.avatarUrl}
                    alt={slot.agent.name}
                    className="w-8 h-8 rounded-full bg-gray-100 object-cover"
                  />
                  {slot.presentationOutput && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{slot.agent.name}</p>
                  <p className="text-xs text-gray-400 truncate">{slot.topic}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: presentation + follow-up */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {!activeSlot ? (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              Select a presenter from the left
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto px-8 py-6">
                <div className="flex items-center gap-4 mb-6">
                  <img
                    src={activeSlot.agent.avatarUrl}
                    alt={activeSlot.agent.name}
                    className="w-12 h-12 rounded-full bg-gray-100 object-cover"
                  />
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{activeSlot.agent.name}</h3>
                    <p className="text-sm text-green-600 font-medium">
                      {activeSlot.agent.role} · {activeSlot.agent.department}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">Topic: {activeSlot.topic}</p>
                  </div>
                </div>

                {activeSlot.presentationOutput ? (
                  <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {activeSlot.presentationOutput}
                  </div>
                ) : (
                  <div className="text-center py-16 text-gray-400">
                    {meeting.status === 'SCHEDULED'
                      ? 'Run the meeting to see this presentation'
                      : 'No presentation generated'}
                  </div>
                )}

                {/* Follow-up Q&A */}
                {activeSlot.presentationOutput && (
                  <div className="mt-8 border-t border-gray-100 pt-6">
                    <h4 className="text-sm font-semibold text-gray-400 mb-4">Follow-up Q&A</h4>
                    <div className="space-y-4">
                      {(presentationFollowups[activeSlot.id] || []).map((msg, idx) => (
                        <div
                          key={idx}
                          className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                        >
                          {msg.role === 'assistant' && (
                            <img
                              src={activeSlot.agent.avatarUrl}
                              alt={activeSlot.agent.name}
                              className="w-7 h-7 rounded-full bg-gray-100 object-cover flex-shrink-0 mt-0.5"
                            />
                          )}
                          <div
                            className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                              msg.role === 'user'
                                ? 'btn-primary rounded-tr-sm text-white'
                                : 'bg-gray-100 text-gray-900 rounded-tl-sm'
                            }`}
                            style={
                              msg.role === 'user'
                                ? { background: 'linear-gradient(to right, #4ADE80, #9CA3AF)' }
                                : {}
                            }
                          >
                            {msg.content}
                          </div>
                        </div>
                      ))}
                      {presAsking && (
                        <div className="flex gap-3">
                          <img
                            src={activeSlot.agent.avatarUrl}
                            alt=""
                            className="w-7 h-7 rounded-full bg-gray-100 object-cover flex-shrink-0"
                          />
                          <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-2.5 flex items-center gap-1">
                            {[0, 150, 300].map(delay => (
                              <div
                                key={delay}
                                className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                                style={{ animationDelay: `${delay}ms` }}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      <div ref={bottomRef} />
                    </div>
                  </div>
                )}
              </div>

              {/* Follow-up input */}
              {activeSlot.presentationOutput && (
                <form
                  onSubmit={askPresFollowup}
                  className="px-8 py-4 border-t border-gray-200 flex gap-3 bg-white"
                >
                  <input
                    className="input flex-1"
                    placeholder={`Ask ${activeSlot.agent.name} a follow-up question…`}
                    value={presQuestion}
                    onChange={e => setPresQuestion(e.target.value)}
                    disabled={presAsking}
                  />
                  <button
                    type="submit"
                    className="btn-primary px-3"
                    disabled={presAsking || !presQuestion.trim()}
                  >
                    <Send size={16} />
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ── CHAT MODE ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <Link
          to="/meeting-room"
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-gray-900 truncate">{meeting.title}</h2>
          <p className="text-xs text-gray-400">
            {new Date(meeting.scheduledAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="badge bg-green-100 text-green-700 flex items-center gap-1">
            <MessageSquare size={10} /> Chat
          </span>
          <MeetingStatusBadge status={meeting.status} />
          {meeting.status === 'SCHEDULED' && (
            <button
              className="btn-primary flex items-center gap-2 text-sm py-1.5"
              onClick={runMeeting}
            >
              <Play size={13} /> Run meeting
            </button>
          )}
          {meeting.status === 'COMPLETED' && (
            <button
              className="flex items-center gap-2 text-sm font-semibold text-white px-4 py-1.5 rounded-full"
              style={{ background: 'linear-gradient(to right, #89dba8, #a8d97a)' }}
              onClick={() => navigate(`/meetings/${id}/summary`)}
            >
              <Sparkles size={13} /> View Summary
            </button>
          )}
        </div>
      </div>

      {/* Chat body */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-2">
        {topicGroups.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            {meeting.status === 'SCHEDULED'
              ? 'Run the meeting to see the conversation'
              : 'No transcript available'}
          </div>
        )}

        {topicGroups.map(([topicIdx, msgs]) => (
          <div key={topicIdx} className="mb-6">
            {/* Topic header */}
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest py-3 text-center border-b border-gray-100 mb-4">
              {msgs[0]?.topic || `Topic ${topicIdx + 1}`}
            </div>

            {/* Messages */}
            <div className="space-y-4">
              {msgs.map((msg, i) => (
                <div key={i} className="flex items-start gap-3">
                  <img
                    src={msg.agentAvatar}
                    alt={msg.agentName}
                    className="w-8 h-8 rounded-full object-cover flex-shrink-0 mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-sm font-semibold text-gray-800">{msg.agentName}</span>
                      <span className="text-xs text-gray-400">{msg.agentRole}</span>
                    </div>
                    <div className="bg-gray-100 text-gray-900 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed inline-block max-w-[80%]">
                      {msg.content}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Chat follow-up messages */}
        {chatFollowups.length > 0 && (
          <div className="mb-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest py-3 text-center border-b border-gray-100 mb-4">
              Follow-up
            </div>
            <div className="space-y-4">
              {chatFollowups.map((msg, i) => {
                if (msg.role === 'user') {
                  return (
                    <div key={i} className="flex justify-end">
                      <div
                        className="max-w-[75%] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm text-white whitespace-pre-wrap"
                        style={{ background: 'linear-gradient(to right, #4ADE80, #9CA3AF)' }}
                      >
                        {msg.content}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={i} className="flex items-start gap-3">
                    {msg.agentAvatar && (
                      <img
                        src={msg.agentAvatar}
                        alt={msg.agentName}
                        className="w-8 h-8 rounded-full object-cover flex-shrink-0 mt-0.5"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      {msg.agentName && (
                        <p className="text-sm font-semibold text-gray-800 mb-1">{msg.agentName}</p>
                      )}
                      <div className="bg-gray-100 text-gray-900 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm whitespace-pre-wrap inline-block max-w-[80%]">
                        {msg.content}
                      </div>
                    </div>
                  </div>
                );
              })}

              {chatAsking && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0 mt-0.5" />
                  <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-2.5 flex items-center gap-1">
                    {[0, 150, 300].map(delay => (
                      <div
                        key={delay}
                        className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: `${delay}ms` }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Follow-up input */}
      {(meeting.status === 'COMPLETED' || chatFollowups.length > 0 || topicGroups.length > 0) && (
        <form
          onSubmit={askChatFollowup}
          className="flex gap-2 px-4 sm:px-8 py-4 border-t border-gray-200 bg-white flex-shrink-0"
        >
          {/* Agent selector */}
          <div className="relative flex-shrink-0">
            <select
              className="input pr-7 text-sm"
              style={{ width: 'auto', minWidth: '11rem' }}
              value={chatAgentId}
              onChange={e => setChatAgentId(e.target.value)}
              disabled={chatAsking}
            >
              <option value="">Pick an agent…</option>
              {meetingAgents.map(agent => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-gray-400">
              <ChevronDown size={12} />
            </div>
          </div>

          <input
            className="input flex-1 text-sm"
            placeholder={
              chatAgentId
                ? `Ask ${meetingAgents.find(a => a.id === chatAgentId)?.name ?? 'agent'} a question…`
                : 'Select an agent to ask a question…'
            }
            value={chatQuestion}
            onChange={e => setChatQuestion(e.target.value)}
            disabled={chatAsking || !chatAgentId}
          />
          <button
            type="submit"
            className="btn-primary px-3 flex-shrink-0"
            disabled={chatAsking || !chatQuestion.trim() || !chatAgentId}
          >
            {chatAsking ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </form>
      )}
    </div>
  );
}
