import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { meetings as meetingsApi, agents as agentsApi, tasks as tasksApi, members as membersApi } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import type { Meeting, Agent, MeetingSummary, MeetingSummaryActionItem, CompanyMember } from '../types';
import {
  Mic, MicOff, Video, VideoOff, MessageSquare, Users, PhoneOff,
  X, Send, ArrowLeft, Loader2, CheckSquare, Square, Lightbulb,
  Target, ListChecks, ArrowRight, ChevronRight, Sparkles,
} from 'lucide-react';
import { isChiefOfStaff, COS_GLOW } from '../lib/chiefOfStaff';

// ── Types ────────────────────────────────────────────────────────────────────

type CallPhase = 'loading' | 'preview' | 'joining' | 'call' | 'ended' | 'summary';

interface AgentState {
  agent: Agent;
  status: 'waiting' | 'idle' | 'speaking' | 'done';
  response: string;
}

interface TranscriptEntry {
  agentName: string;
  agentRole: string;
  agentAvatar: string;
  text: string;
}

interface ChatMsg {
  role: 'user' | 'agent';
  content: string;
  agentName?: string;
  agentAvatar?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ── TTS helpers ───────────────────────────────────────────────────────────────

function getSpeechSettings(role: string): { rate: number; pitch: number } {
  const r = role.toLowerCase();
  if (r.includes('cto') || r.includes('engineer') || r.includes('tech')) return { rate: 0.88, pitch: 0.82 };
  if (r.includes('cfo') || r.includes('financ') || r.includes('account')) return { rate: 0.87, pitch: 0.88 };
  if (r.includes('ceo') || r.includes('founder') || r.includes('chief exec')) return { rate: 0.90, pitch: 0.85 };
  if (r.includes('design') || r.includes('creative') || r.includes('ux')) return { rate: 1.0, pitch: 1.12 };
  if (r.includes('market') || r.includes('growth') || r.includes('brand')) return { rate: 1.05, pitch: 1.05 };
  if (r.includes('product') || r.includes('pm ') || r.includes('product manager')) return { rate: 0.95, pitch: 1.0 };
  if (r.includes('hr') || r.includes('people') || r.includes('talent')) return { rate: 0.93, pitch: 1.08 };
  if (r.includes('sales') || r.includes('revenue') || r.includes('business dev')) return { rate: 1.08, pitch: 1.0 };
  if (r.includes('legal') || r.includes('counsel') || r.includes('compliance')) return { rate: 0.85, pitch: 0.90 };
  return { rate: 0.95, pitch: 1.0 };
}

function pickVoice(
  agent: Agent,
  index: number,
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const isFemale = agent.avatarUrl.includes('/women/');

  const FEMALE_PREFS = [
    'Google UK English Female', 'Samantha', 'Victoria', 'Karen',
    'Tessa', 'Moira', 'Fiona', 'Veena',
  ];
  const MALE_PREFS = [
    'Google UK English Male', 'Alex', 'Daniel', 'Fred', 'Tom',
    'Oliver', 'Arthur', 'Gordon',
  ];

  const prefs = isFemale ? FEMALE_PREFS : MALE_PREFS;
  for (const name of prefs) {
    const v = voices.find(v => v.name === name);
    if (v) return v;
  }

  // Gender-filtered fallback
  const tag = isFemale ? 'female' : 'male';
  const gendered = voices.filter(v => v.name.toLowerCase().includes(tag));
  if (gendered.length) return gendered[index % gendered.length];

  // Any voice as last resort
  return voices[index % voices.length] ?? null;
}

// ── Sound wave animation ─────────────────────────────────────────────────────

function SoundWave() {
  const delays = [0, 180, 90, 270];
  return (
    <div className="flex items-end gap-1 h-6 mt-2">
      {delays.map((delay, i) => (
        <div
          key={i}
          className="w-1.5 bg-green-400 rounded-full origin-bottom"
          style={{
            height: '24px',
            animation: 'soundBar 0.65s ease-in-out infinite',
            animationDelay: `${delay}ms`,
          }}
        />
      ))}
    </div>
  );
}

// ── Large active speaker tile ────────────────────────────────────────────────

function ActiveTile({ state }: { state: AgentState }) {
  const speaking = state.status === 'speaking';
  const cos = isChiefOfStaff(state.agent);
  const speakingStyle = cos
    ? { boxShadow: COS_GLOW }
    : { animation: 'speakingRing 1.2s ease-in-out infinite' };
  return (
    <div className="flex flex-col items-center" style={{ animation: 'fadeInUp 0.3s ease-out' }}>
      <div className="relative">
        <img
          src={state.agent.avatarUrl}
          alt={state.agent.name}
          className="w-40 h-40 rounded-2xl object-cover"
          style={speaking ? speakingStyle : { boxShadow: '0 0 0 3px #374151' }}
        />
        {speaking && (
          <div className="absolute -bottom-2 -right-2 w-6 h-6 bg-green-400 rounded-full flex items-center justify-center">
            <Mic size={12} className="text-white" />
          </div>
        )}
      </div>
      <p className="text-white font-semibold mt-4 text-lg">{state.agent.name}</p>
      <p className="text-gray-400 text-sm">{state.agent.role}</p>
      {speaking && <SoundWave />}
    </div>
  );
}

// ── Small thumbnail tile ─────────────────────────────────────────────────────

function SmallTile({ state, onClick }: { state: AgentState; onClick?: () => void }) {
  const speaking = state.status === 'speaking';
  const done = state.status === 'done';
  const cos = isChiefOfStaff(state.agent);
  const speakingGlow = cos ? COS_GLOW : '0 0 0 2px #4ade80, 0 0 10px #4ade80';
  return (
    <div
      className="flex flex-col items-center gap-1.5 cursor-pointer"
      onClick={onClick}
    >
      <div className="relative">
        <img
          src={state.agent.avatarUrl}
          alt={state.agent.name}
          className={`w-16 h-16 rounded-xl object-cover transition-all ${
            done ? 'opacity-60' : 'opacity-100'
          }`}
          style={speaking ? { boxShadow: speakingGlow } : { boxShadow: '0 0 0 2px #374151' }}
        />
        {state.status === 'waiting' && (
          <div className="absolute inset-0 rounded-xl bg-black/50 flex items-center justify-center">
            <Loader2 size={14} className="text-gray-400 animate-spin" />
          </div>
        )}
      </div>
      <p className="text-gray-300 text-xs font-medium truncate max-w-[72px] text-center">
        {state.agent.name.split(' ')[0]}
      </p>
    </div>
  );
}

// ── Human member tile (passive — no speaking) ────────────────────────────────

function MemberTile({ member }: { member: CompanyMember }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative">
        {member.photoUrl ? (
          <img src={member.photoUrl} alt={member.name}
            className="w-16 h-16 rounded-xl object-cover"
            style={{ boxShadow: '0 0 0 2px #3b82f6' }} />
        ) : (
          <div className="w-16 h-16 rounded-xl flex items-center justify-center text-xl font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #89dba8, #a8d97a)', boxShadow: '0 0 0 2px #3b82f6' }}>
            {member.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-blue-500 rounded-full border-2 border-gray-900 flex items-center justify-center text-white" style={{ fontSize: 7 }}>H</div>
      </div>
      <p className="text-gray-300 text-xs font-medium truncate max-w-[72px] text-center">
        {member.name.split(' ')[0]}
      </p>
    </div>
  );
}

// ── User (CEO) tile ──────────────────────────────────────────────────────────

function UserTile({ name, videoOn, muted }: { name: string; videoOn: boolean; muted: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="w-16 h-16 rounded-xl flex items-center justify-center text-xl font-bold text-white relative"
        style={{ background: 'linear-gradient(135deg, #89dba8, #a8d97a)', boxShadow: '0 0 0 2px #4b5563' }}
      >
        {videoOn ? name.charAt(0).toUpperCase() : <VideoOff size={20} className="text-white/80" />}
        {muted && (
          <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
            <MicOff size={10} className="text-white" />
          </div>
        )}
      </div>
      <p className="text-gray-300 text-xs font-medium">You (Owner)</p>
    </div>
  );
}

// ── Control bar ──────────────────────────────────────────────────────────────

function ControlBar({
  muted, videoOn, showChat, showParticipants,
  onMute, onVideo, onChat, onParticipants, onEnd,
}: {
  muted: boolean; videoOn: boolean; showChat: boolean; showParticipants: boolean;
  onMute: () => void; onVideo: () => void; onChat: () => void;
  onParticipants: () => void; onEnd: () => void;
}) {
  const btn = 'flex flex-col items-center gap-1.5 px-4 py-2 rounded-2xl transition-all hover:bg-white/10 text-gray-300 hover:text-white';
  const activeBtn = 'flex flex-col items-center gap-1.5 px-4 py-2 rounded-2xl bg-white/10 text-white';
  const iconBg = 'w-11 h-11 rounded-full flex items-center justify-center';

  return (
    <div className="flex items-center justify-center gap-2 px-6 py-4 border-t border-white/5">
      <button className={muted ? activeBtn : btn} onClick={onMute}>
        <div className={`${iconBg} ${muted ? 'bg-red-500/20' : 'bg-white/10'}`}>
          {muted ? <MicOff size={20} className="text-red-400" /> : <Mic size={20} />}
        </div>
        <span className="text-xs">{muted ? 'Unmute' : 'Mute'}</span>
      </button>

      <button className={!videoOn ? activeBtn : btn} onClick={onVideo}>
        <div className={`${iconBg} ${!videoOn ? 'bg-red-500/20' : 'bg-white/10'}`}>
          {videoOn ? <Video size={20} /> : <VideoOff size={20} className="text-red-400" />}
        </div>
        <span className="text-xs">{videoOn ? 'Stop Video' : 'Start Video'}</span>
      </button>

      <button className={showChat ? activeBtn : btn} onClick={onChat}>
        <div className={`${iconBg} ${showChat ? 'bg-white/20' : 'bg-white/10'}`}>
          <MessageSquare size={20} />
        </div>
        <span className="text-xs">Chat</span>
      </button>

      <button className={showParticipants ? activeBtn : btn} onClick={onParticipants}>
        <div className={`${iconBg} ${showParticipants ? 'bg-white/20' : 'bg-white/10'}`}>
          <Users size={20} />
        </div>
        <span className="text-xs">Participants</span>
      </button>

      <button
        className="flex flex-col items-center gap-1.5 px-4 py-2 rounded-2xl transition-all hover:bg-red-500/10 text-red-400 hover:text-red-300 ml-8"
        onClick={onEnd}
      >
        <div className="w-11 h-11 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center transition-colors">
          <PhoneOff size={20} className="text-white" />
        </div>
        <span className="text-xs">End Call</span>
      </button>
    </div>
  );
}

// ── Chat panel ───────────────────────────────────────────────────────────────

function ChatPanel({
  messages, onSend, onClose, sending,
}: {
  messages: ChatMsg[]; onSend: (text: string) => void;
  onClose: () => void; sending: boolean;
}) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;
    onSend(input.trim());
    setInput('');
  };

  return (
    <div className="w-80 flex flex-col border-l border-white/10 bg-[#2C2C2E]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <h3 className="text-white font-semibold text-sm">Meeting Chat</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-gray-500 text-xs text-center py-4">
            Ask a question to any agent during the call
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {msg.role === 'agent' && msg.agentAvatar && (
              <img src={msg.agentAvatar} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-0.5" />
            )}
            <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
              msg.role === 'user'
                ? 'text-white rounded-tr-sm'
                : 'bg-white/10 text-gray-200 rounded-tl-sm'
            }`} style={msg.role === 'user' ? { background: 'linear-gradient(to right, #89dba8, #a8d97a)', color: 'white' } : {}}>
              {msg.role === 'agent' && msg.agentName && (
                <p className="text-green-400 text-xs font-semibold mb-1">{msg.agentName}</p>
              )}
              {msg.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex gap-2">
            <div className="w-7 h-7 rounded-full bg-white/10 flex-shrink-0" />
            <div className="bg-white/10 rounded-2xl rounded-tl-sm px-3 py-2 flex gap-1 items-center">
              {[0, 150, 300].map(d => (
                <div key={d} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={submit} className="flex gap-2 px-3 py-3 border-t border-white/10">
        <input
          className="flex-1 bg-white/10 text-white placeholder-gray-500 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-400"
          placeholder="Ask a question..."
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={sending}
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className="w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-40 transition-opacity"
          style={{ background: 'linear-gradient(to right, #89dba8, #a8d97a)' }}
        >
          <Send size={14} className="text-white" />
        </button>
      </form>
    </div>
  );
}

// ── Participants panel ───────────────────────────────────────────────────────

function ParticipantsPanel({
  agentStates, meetingMembers, userName, onClose,
}: {
  agentStates: AgentState[]; meetingMembers: CompanyMember[]; userName: string; onClose: () => void;
}) {
  const total = agentStates.length + meetingMembers.length + 1;
  return (
    <div className="w-72 flex flex-col border-l border-white/10 bg-[#2C2C2E]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <h3 className="text-white font-semibold text-sm">Participants ({total})</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {/* User row */}
        <div className="flex items-center gap-3 px-4 py-2.5">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg, #89dba8, #a8d97a)' }}>
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium">{userName}</p>
            <p className="text-gray-500 text-xs">Owner · Host</p>
          </div>
          <div className="w-2 h-2 bg-green-400 rounded-full" />
        </div>

        {/* Human members */}
        {meetingMembers.map(member => (
          <div key={member.id} className="flex items-center gap-3 px-4 py-2.5">
            {member.photoUrl ? (
              <img src={member.photoUrl} alt={member.name} className="w-8 h-8 rounded-full object-cover" style={{ boxShadow: '0 0 0 2px #3b82f6' }} />
            ) : (
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg, #89dba8, #a8d97a)', boxShadow: '0 0 0 2px #3b82f6' }}>
                {member.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{member.name}</p>
              <p className="text-gray-500 text-xs truncate">{member.role === 'PARTNER' ? 'Partner' : 'Employee'}</p>
            </div>
            <div className="w-2 h-2 bg-blue-400 rounded-full" />
          </div>
        ))}

        {agentStates.map(state => (
          <div key={state.agent.id} className="flex items-center gap-3 px-4 py-2.5">
            <img src={state.agent.avatarUrl} alt={state.agent.name} className="w-8 h-8 rounded-full object-cover" />
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{state.agent.name}</p>
              <p className="text-gray-500 text-xs truncate">{state.agent.role}</p>
            </div>
            <div className={`w-2 h-2 rounded-full ${state.status === 'waiting' ? 'bg-gray-600' : state.status === 'speaking' ? 'bg-green-400' : 'bg-gray-500'}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main VideoCallPage ────────────────────────────────────────────────────────

export default function VideoCallPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [agentStates, setAgentStates] = useState<AgentState[]>([]);
  const [meetingMembers, setMeetingMembers] = useState<CompanyMember[]>([]);
  const [phase, setPhase] = useState<CallPhase>('loading');
  const [activeSpeakerIndex, setActiveSpeakerIndex] = useState<number>(-1);
  const [subtitleText, setSubtitleText] = useState('');
  const [joinNotification, setJoinNotification] = useState<string | null>(null);
  const [fullTranscript, setFullTranscript] = useState<TranscriptEntry[]>([]);

  // UI state
  const [muted, setMuted] = useState(false);
  const [videoOn, setVideoOn] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatSending, setChatSending] = useState(false);

  // Inline summary state
  const [summaryData, setSummaryData] = useState<MeetingSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [taskCreatedFor, setTaskCreatedFor] = useState<Set<string>>(new Set());

  // Cancel flag — set to true when End Call is pressed
  const isCancelledRef = useRef(false);

  // Timer
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // TTS — load voices (Chrome loads them async)
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    const load = () => { voicesRef.current = window.speechSynthesis.getVoices(); };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', load);
      window.speechSynthesis.cancel();
    };
  }, []);

  // Load meeting on mount
  useEffect(() => {
    if (!id) return;
    meetingsApi.get(id)
      .then(async ({ meeting: m }) => {
        setMeeting(m);
        let agents = m.slots
          .sort((a, b) => a.order - b.order)
          .map(s => s.agent as Agent);
        // Chief of Staff always speaks first
        const cosIdx = agents.findIndex(a => isChiefOfStaff(a));
        if (cosIdx > 0) {
          const [cos] = agents.splice(cosIdx, 1);
          agents = [cos, ...agents];
        }
        setAgentStates(agents.map(a => ({ agent: a, status: 'waiting', response: '' })));

        // Load member attendees if any
        if (m.memberIds && m.memberIds.length > 0) {
          try {
            const { members } = await membersApi.list();
            setMeetingMembers(members.filter(mem => m.memberIds!.includes(mem.id)));
          } catch {
            // non-fatal
          }
        }

        setPhase('preview');
      })
      .catch(err => {
        console.error('[VideoCall] Failed to load meeting:', err);
      });
  }, [id]);

  // Timer
  useEffect(() => {
    if (phase === 'call') {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  // Animate subtitle word by word AND speak via TTS; resolves when both finish
  const animateSubtitle = useCallback((
    text: string,
    agent: Agent,
    agentIndex: number,
  ): Promise<void> => {
    return new Promise(resolve => {
      const words = text.split(' ');
      let wordsDone = false;
      let speechDone = false;

      const checkDone = () => { if (wordsDone && speechDone) resolve(); };

      // Word-by-word animation
      let i = 0;
      setSubtitleText('');
      const timer = setInterval(() => {
        i++;
        setSubtitleText(words.slice(0, i).join(' '));
        if (i >= words.length) {
          clearInterval(timer);
          wordsDone = true;
          checkDone();
        }
      }, 75);

      // TTS
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = pickVoice(agent, agentIndex, voicesRef.current);
      if (voice) utterance.voice = voice;
      const { rate, pitch } = getSpeechSettings(agent.role);
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.volume = 0.95;
      utterance.onend = () => { speechDone = true; checkDone(); };
      utterance.onerror = () => { speechDone = true; checkDone(); };
      window.speechSynthesis.speak(utterance);
    });
  }, []);

  // Run the speaking loop for all agents
  const runSpeakingLoop = useCallback(async (
    states: AgentState[],
    mtg: Meeting,
  ) => {
    const history: TranscriptEntry[] = [];
    const agenda = mtg.agenda.join(', ');

    for (let i = 0; i < states.length; i++) {
      if (isCancelledRef.current) break;

      const { agent } = states[i];

      setActiveSpeakerIndex(i);
      setAgentStates(prev => prev.map((s, idx) => ({
        ...s,
        status: idx === i ? 'speaking' : idx < i ? 'done' : 'idle',
      })));

      const prevContext = history.length > 0
        ? `\n\nPrevious speakers:\n${history.map(h => `${h.agentName} (${h.agentRole}): ${h.text}`).join('\n')}`
        : '';

      const prompt = `[LIVE VIDEO MEETING: "${mtg.title}"]
Agenda: ${agenda}${prevContext}

${history.length === 0
    ? 'You are speaking first. Briefly introduce the topic and share your key perspective.'
    : 'Continue the discussion naturally. React to what was just said and add your viewpoint.'
}

Keep it concise — 2-4 sentences, spoken-word style, like you're in a live video call.`;

      console.log(`[VideoCall] Calling agent ${agent.name}...`);
      try {
        const { reply } = await agentsApi.chat(agent.id, prompt, []);
        console.log(`[VideoCall] ${agent.name} responded (${reply.length} chars)`);
        history.push({ agentName: agent.name, agentRole: agent.role, agentAvatar: agent.avatarUrl, text: reply });

        setAgentStates(prev => prev.map((s, idx) =>
          idx === i ? { ...s, response: reply } : s
        ));

        await animateSubtitle(reply, agent, i);
        window.speechSynthesis.cancel();
        setSubtitleText('');
        await sleep(400);
      } catch (err) {
        console.error(`[VideoCall] ${agent.name} failed:`, err);
        await sleep(500);
      }
    }

    // Chief of Staff delivers closing summary
    const cosIdx = states.findIndex(s => isChiefOfStaff(s.agent));
    if (cosIdx >= 0 && !isCancelledRef.current) {
      const alexState = states[cosIdx];
      setActiveSpeakerIndex(cosIdx);
      setAgentStates(prev => prev.map((s, idx) => ({
        ...s,
        status: idx === cosIdx ? 'speaking' : 'done',
      })));
      const prevSummary = history.map(h => `${h.agentName}: ${h.text}`).join('\n');
      const closingPrompt = `[LIVE VIDEO MEETING WRAP-UP: "${mtg.title}"]\nHere's what was discussed:\n${prevSummary}\n\nAs Chief of Staff, deliver a crisp closing: synthesize the key takeaways, confirm any decisions, and name the one next step. 2-3 sentences max. Authoritative and clear — you run this meeting.`;
      try {
        const { reply } = await agentsApi.chat(alexState.agent.id, closingPrompt, []);
        history.push({
          agentName: alexState.agent.name,
          agentRole: alexState.agent.role,
          agentAvatar: alexState.agent.avatarUrl,
          text: reply,
        });
        setAgentStates(prev => prev.map((s, idx) =>
          idx === cosIdx ? { ...s, response: reply } : s
        ));
        await animateSubtitle(reply, alexState.agent, cosIdx);
        window.speechSynthesis.cancel();
        setSubtitleText('');
        await sleep(400);
      } catch (err) {
        console.error('[VideoCall] Alex closing failed:', err);
      }
    }

    window.speechSynthesis.cancel();
    setFullTranscript(history);
    return history;
  }, [animateSubtitle]);

  // Join the call flow
  const joinCall = useCallback(async () => {
    if (!meeting || agentStates.length === 0) return;
    isCancelledRef.current = false;
    setPhase('joining');

    // Agents join one by one
    for (let i = 0; i < agentStates.length; i++) {
      await sleep(350);
      setJoinNotification(`${agentStates[i].agent.name} joined the call`);
      setAgentStates(prev => prev.map((s, idx) =>
        idx === i ? { ...s, status: 'idle' } : s
      ));
    }

    await sleep(1200);
    setJoinNotification(null);
    setPhase('call');

    // Start speaking loop
    const transcript = await runSpeakingLoop(agentStates, meeting);

    if (isCancelledRef.current) return; // User ended the call

    // Save transcript + switch to summary phase
    try {
      await meetingsApi.end(id!, transcript.map(t => JSON.stringify(t)));
    } catch (err) {
      console.error('[VideoCall] Could not save transcript:', err);
    }

    setPhase('summary');
    setSummaryLoading(true);
    setSummaryError('');

    meetingsApi.summarize(id!)
      .then(({ summary: s }) => setSummaryData(s))
      .catch(() => setSummaryError('Could not generate summary. The transcript has been saved.'))
      .finally(() => setSummaryLoading(false));
  }, [meeting, agentStates, id, runSpeakingLoop]);

  // Send chat message (ask any agent a question during the call)
  const sendChatMessage = useCallback(async (text: string) => {
    setChatMessages(prev => [...prev, { role: 'user', content: text }]);
    setChatSending(true);

    // Pick the current active speaker (or first agent if none active)
    const targetIndex = activeSpeakerIndex >= 0
      ? activeSpeakerIndex
      : agentStates.findIndex(s => s.status !== 'waiting');
    const target = agentStates[targetIndex >= 0 ? targetIndex : 0];
    if (!target) { setChatSending(false); return; }

    try {
      const { reply } = await agentsApi.chat(target.agent.id, text, []);
      setChatMessages(prev => [...prev, {
        role: 'agent',
        content: reply,
        agentName: target.agent.name,
        agentAvatar: target.agent.avatarUrl,
      }]);
    } catch {
      setChatMessages(prev => [...prev, { role: 'agent', content: '⚠ Failed to get a response.' }]);
    } finally {
      setChatSending(false);
    }
  }, [activeSpeakerIndex, agentStates]);

  const endCall = useCallback(() => {
    if (phase !== 'call' && phase !== 'joining') return;
    isCancelledRef.current = true;       // stop the speaking loop immediately
    window.speechSynthesis.cancel();     // kill any active TTS
    setSubtitleText('');
    if (timerRef.current) clearInterval(timerRef.current);
    meetingsApi.end(id!).catch(() => {}); // fire and forget
    navigate('/dashboard');
  }, [phase, id, navigate]);

  // ── Render: loading ──────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-[#1C1C1E] flex items-center justify-center">
        <Loader2 size={32} className="text-green-400 animate-spin" />
      </div>
    );
  }

  // ── Render: preview ──────────────────────────────────────────────────────

  if (phase === 'preview') {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6"
        style={{ background: 'radial-gradient(ellipse at center, #1a2a1a 0%, #1C1C1E 70%)' }}
      >
        {/* User preview tile */}
        <div
          className="w-36 h-36 rounded-3xl flex items-center justify-center text-5xl font-bold text-white mb-6 shadow-2xl"
          style={{ background: 'linear-gradient(135deg, #89dba8, #a8d97a)' }}
        >
          {user?.name?.charAt(0).toUpperCase()}
        </div>

        <h1 className="text-white text-2xl font-bold tracking-tight mb-1">{meeting?.title}</h1>
        <p className="text-gray-400 text-sm mb-8">
          {agentStates.length} participants · Ready to join
        </p>

        {/* Attendee previews */}
        <div className="flex -space-x-3 mb-8">
          {agentStates.slice(0, 8).map(s => (
            <img
              key={s.agent.id}
              src={s.agent.avatarUrl}
              alt={s.agent.name}
              title={s.agent.name}
              className="w-10 h-10 rounded-full object-cover border-2 border-[#1C1C1E]"
            />
          ))}
          {agentStates.length > 8 && (
            <div className="w-10 h-10 rounded-full bg-white/10 border-2 border-[#1C1C1E] flex items-center justify-center text-xs text-gray-300">
              +{agentStates.length - 8}
            </div>
          )}
        </div>

        {/* Preview controls */}
        <div className="flex gap-4 mb-8">
          <button
            onClick={() => setMuted(!muted)}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
              muted ? 'bg-red-600' : 'bg-white/10 hover:bg-white/20'
            }`}
          >
            {muted ? <MicOff size={22} className="text-white" /> : <Mic size={22} className="text-white" />}
          </button>
          <button
            onClick={() => setVideoOn(!videoOn)}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
              !videoOn ? 'bg-red-600' : 'bg-white/10 hover:bg-white/20'
            }`}
          >
            {videoOn ? <Video size={22} className="text-white" /> : <VideoOff size={22} className="text-white" />}
          </button>
        </div>

        <button
          onClick={joinCall}
          className="text-white font-semibold px-10 py-4 rounded-full text-lg shadow-lg hover:opacity-90 active:scale-95 transition-all"
          style={{ background: 'linear-gradient(to right, #89dba8, #a8d97a)' }}
        >
          Join Now
        </button>

        <button
          onClick={() => navigate(-1)}
          className="mt-4 text-gray-500 hover:text-gray-300 text-sm flex items-center gap-2 transition-colors"
        >
          <ArrowLeft size={14} /> Go back
        </button>
      </div>
    );
  }

  // ── Render: summary ─────────────────────────────────────────────────────

  if (phase === 'summary') {
    const createTask = async (item: MeetingSummaryActionItem) => {
      try {
        await tasksApi.create({
          title: item.what,
          description: `Action item from meeting: "${meeting?.title ?? ''}"`,
          assignedAgentId: item.agentId ?? undefined,
          priority: 'MEDIUM',
        });
        setTaskCreatedFor(prev => new Set([...prev, item.what]));
      } catch { /* ignore */ }
    };

    const attendees = meeting?.slots?.map(s => s.agent) ?? [];

    return (
      <div className="p-8 max-w-3xl mx-auto pb-24 bg-white min-h-screen">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{meeting?.title}</h1>
            <p className="text-sm text-gray-400 mt-1">Meeting complete · {formatTime(elapsed)}</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-white flex-shrink-0"
            style={{ background: 'linear-gradient(to right, #89dba8, #a8d97a)' }}>
            <Sparkles size={14} /> Summary
          </div>
        </div>

        {summaryLoading && (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-6 animate-pulse">
                <div className="h-4 bg-gray-100 rounded w-40 mb-4" />
                <div className="space-y-2">
                  <div className="h-3 bg-gray-100 rounded w-full" />
                  <div className="h-3 bg-gray-100 rounded w-4/5" />
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2 justify-center text-gray-400 text-sm mt-4">
              <Loader2 size={16} className="animate-spin text-green-500" />
              Generating summary with AI…
            </div>
          </div>
        )}

        {summaryError && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-5 text-sm text-red-600 mb-6">
            {summaryError}
          </div>
        )}

        {summaryData && !summaryLoading && (
          <div className="space-y-4">
            {/* Attendees */}
            {attendees.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#89dba8,#a8d97a)' }}>
                    <Users size={17} className="text-white" />
                  </div>
                  <h2 className="font-semibold text-gray-900">Attendees</h2>
                </div>
                <div className="flex flex-wrap gap-3">
                  {attendees.map(agent => (
                    <div key={agent.id} className="flex items-center gap-2 bg-gray-50 rounded-full px-3 py-1.5">
                      <img src={agent.avatarUrl} alt={agent.name} className="w-5 h-5 rounded-full object-cover" />
                      <span className="text-sm text-gray-700 font-medium">{agent.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Key Points */}
            {summaryData.keyPoints.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#89dba8,#a8d97a)' }}>
                    <Lightbulb size={17} className="text-white" />
                  </div>
                  <h2 className="font-semibold text-gray-900">Key Points</h2>
                </div>
                <div className="space-y-4">
                  {summaryData.keyPoints.map((kp, i) => (
                    <div key={i}>
                      <p className="text-sm font-semibold text-gray-700 mb-2">{kp.topic}</p>
                      <ul className="space-y-1">
                        {kp.points.map((pt, j) => (
                          <li key={j} className="flex items-start gap-2 text-sm text-gray-600">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#89dba8] flex-shrink-0 mt-2" />
                            {pt}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Decisions */}
            {summaryData.decisions.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#89dba8,#a8d97a)' }}>
                    <Target size={17} className="text-white" />
                  </div>
                  <h2 className="font-semibold text-gray-900">Decisions Made</h2>
                </div>
                <ul className="space-y-2">
                  {summaryData.decisions.map((d, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <CheckSquare size={15} className="text-[#3db87a] flex-shrink-0 mt-0.5" />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Action Items */}
            {summaryData.actionItems.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#89dba8,#a8d97a)' }}>
                    <ListChecks size={17} className="text-white" />
                  </div>
                  <h2 className="font-semibold text-gray-900">Action Items</h2>
                </div>
                <p className="text-xs text-gray-400 mb-3">Click "+ Task" to add to your Tasks board</p>
                <div className="space-y-1">
                  {summaryData.actionItems.map((item, i) => {
                    const created = taskCreatedFor.has(item.what);
                    return (
                      <div key={i} className={`flex items-start gap-3 p-3 rounded-xl transition-all ${created ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
                        <div className="flex-shrink-0 mt-0.5">
                          {created ? <CheckSquare size={17} className="text-green-500" /> : <Square size={17} className="text-gray-300" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${created ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{item.what}</p>
                          <div className="flex items-center gap-3 mt-1">
                            {item.agentAvatar && (
                              <div className="flex items-center gap-1.5">
                                <img src={item.agentAvatar} alt={item.who} className="w-4 h-4 rounded-full object-cover" />
                                <span className="text-xs text-gray-500">{item.who}</span>
                              </div>
                            )}
                            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{item.timeline}</span>
                          </div>
                        </div>
                        {!created && (
                          <button onClick={() => createTask(item)}
                            className="flex-shrink-0 text-xs text-[#3db87a] hover:text-green-700 font-medium flex items-center gap-1 transition-colors">
                            + Task <ChevronRight size={12} />
                          </button>
                        )}
                        {created && <span className="flex-shrink-0 text-xs text-green-500 font-medium">Added ✓</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Next Steps */}
            {summaryData.nextSteps.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#89dba8,#a8d97a)' }}>
                    <ArrowRight size={17} className="text-white" />
                  </div>
                  <h2 className="font-semibold text-gray-900">Next Steps</h2>
                </div>
                <ul className="space-y-2">
                  {summaryData.nextSteps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                      <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 flex-shrink-0 mt-0.5">
                        {i + 1}
                      </div>
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Continue button */}
        <div className="fixed bottom-0 left-0 right-0 flex justify-center pb-8 pt-4 bg-gradient-to-t from-white via-white to-transparent">
          <button
            onClick={() => navigate('/dashboard')}
            className="btn-primary flex items-center gap-2 px-8 shadow-lg"
            disabled={summaryLoading}
          >
            {summaryLoading ? <Loader2 size={16} className="animate-spin" /> : null}
            Continue →
          </button>
        </div>
      </div>
    );
  }

  // ── Render: ended ────────────────────────────────────────────────────────

  if (phase === 'ended') {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6"
        style={{ background: 'radial-gradient(ellipse at center, #1a2a1a 0%, #1C1C1E 70%)' }}
      >
        <div className="w-full max-w-2xl bg-white/5 rounded-3xl p-8 border border-white/10">
          <div className="text-center mb-8">
            <p className="text-4xl mb-3">📋</p>
            <h2 className="text-white text-2xl font-bold tracking-tight">Meeting Complete</h2>
            <p className="text-gray-400 text-sm mt-1">{meeting?.title} · {formatTime(elapsed)}</p>
          </div>

          <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
            {fullTranscript.map((entry, i) => (
              <div key={i} className="flex gap-3">
                <img src={entry.agentAvatar} alt={entry.agentName} className="w-9 h-9 rounded-full object-cover flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-white text-sm font-semibold">{entry.agentName}</span>
                    <span className="text-gray-500 text-xs">{entry.agentRole}</span>
                  </div>
                  <p className="text-gray-300 text-sm leading-relaxed">{entry.text}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3 mt-8 justify-center">
            <button
              onClick={() => navigate('/meeting-room')}
              className="bg-white/10 hover:bg-white/20 text-white font-medium px-6 py-3 rounded-full transition-all text-sm"
            >
              Back to Calendar
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="text-white font-semibold px-6 py-3 rounded-full transition-all text-sm hover:opacity-90"
              style={{ background: 'linear-gradient(to right, #89dba8, #a8d97a)' }}
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: call (joining or active) ────────────────────────────────────

  const activeSpeaker = activeSpeakerIndex >= 0 ? agentStates[activeSpeakerIndex] : null;
  const otherAgents = agentStates.filter((_, i) => i !== activeSpeakerIndex);

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 50% 40%, #0d1f0d 0%, #1C1C1E 65%)' }}
    >
      {/* Main call area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-white text-sm font-semibold">{meeting?.title}</span>
          </div>
          <span className="text-gray-400 text-sm font-mono">{formatTime(elapsed)}</span>
        </div>

        {/* Video grid */}
        <div className="flex-1 flex flex-col justify-between px-6 pb-4 overflow-hidden">
          {/* Active speaker */}
          <div className="flex-1 flex items-center justify-center">
            {phase === 'joining' && !activeSpeaker && (
              <div className="text-center">
                <Loader2 size={32} className="text-green-400 animate-spin mx-auto mb-4" />
                <p className="text-gray-300 text-lg">Participants are joining…</p>
              </div>
            )}
            {activeSpeaker && <ActiveTile state={activeSpeaker} />}
          </div>

          {/* Thumbnail strip */}
          <div className="flex items-end justify-center gap-4 flex-wrap">
            <UserTile
              name={user?.name ?? 'You'}
              videoOn={videoOn}
              muted={muted}
            />
            {meetingMembers.map(member => (
              <MemberTile key={member.id} member={member} />
            ))}
            {otherAgents.map(state => (
              <SmallTile key={state.agent.id} state={state} />
            ))}
          </div>
        </div>

        {/* Subtitle bar */}
        {subtitleText && (
          <div className="flex justify-center px-8 mb-2">
            <div
              className="bg-black/70 backdrop-blur-sm text-white px-6 py-3 rounded-2xl max-w-2xl text-center text-sm leading-relaxed border border-white/10"
              style={{ animation: 'fadeInUp 0.2s ease-out' }}
            >
              {subtitleText}
            </div>
          </div>
        )}

        {/* Control bar */}
        <ControlBar
          muted={muted}
          videoOn={videoOn}
          showChat={showChat}
          showParticipants={showParticipants}
          onMute={() => setMuted(m => !m)}
          onVideo={() => setVideoOn(v => !v)}
          onChat={() => { setShowChat(c => !c); setShowParticipants(false); }}
          onParticipants={() => { setShowParticipants(p => !p); setShowChat(false); }}
          onEnd={endCall}
        />
      </div>

      {/* Side panels */}
      {showChat && (
        <ChatPanel
          messages={chatMessages}
          onSend={sendChatMessage}
          onClose={() => setShowChat(false)}
          sending={chatSending}
        />
      )}
      {showParticipants && (
        <ParticipantsPanel
          agentStates={agentStates}
          meetingMembers={meetingMembers}
          userName={user?.name ?? 'You'}
          onClose={() => setShowParticipants(false)}
        />
      )}

      {/* Join notification */}
      {joinNotification && (
        <div
          className="fixed top-6 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-sm text-white text-sm px-5 py-2.5 rounded-full border border-white/10 z-50"
          style={{ animation: 'fadeInUp 0.25s ease-out' }}
        >
          {joinNotification}
        </div>
      )}
    </div>
  );
}
