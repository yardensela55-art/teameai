import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { meetings as meetingsApi, agents as agentsApi, members as membersApi } from '../lib/api';
import type { Meeting, Agent, CompanyMember } from '../types';
import { MeetingStatusBadge } from '../components/ui/StatusBadge';
import {
  Plus, Video, X, Loader2, Play, MessageSquare, Monitor, Check,
  Camera, Sparkles, ChevronLeft, ChevronRight,
} from 'lucide-react';

// ── Calendar helpers ───────────────────────────────────────────────────────────

const START_HOUR = 7;
const END_HOUR = 22;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
const ROW_H = 64; // px per hour
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getWeekDays(offset: number): Date[] {
  const now = new Date();
  const dow = now.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diff + offset * 7);
  mon.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function isToday(d: Date) { return isSameDay(d, new Date()); }

function getMeetingsForSlot(list: Meeting[], day: Date, hour: number): Meeting[] {
  return list.filter(m => {
    const d = new Date(m.scheduledAt);
    return isSameDay(d, day) && d.getHours() === hour;
  });
}

function pad(n: number) { return String(n).padStart(2, '0'); }
function toDatetimeLocal(d: Date, hour: number) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(hour)}:00`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function MeetingRoomPage() {
  const navigate = useNavigate();
  const [meetingList, setMeetingList] = useState<Meeting[]>([]);
  const [agentList, setAgentList] = useState<Agent[]>([]);
  const [memberList, setMemberList] = useState<CompanyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);

  // Calendar state
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<'CHAT' | 'PRESENTATION' | 'VIDEO'>('CHAT');
  const [leadAgentId, setLeadAgentId] = useState('');
  const [inviteAll, setInviteAll] = useState(true);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [agendaItems, setAgendaItems] = useState(['']);
  const [creating, setCreating] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [scheduledAtPrefill, setScheduledAtPrefill] = useState('');

  // Quick start state
  const [showQuickStart, setShowQuickStart] = useState(false);
  const [quickTitle, setQuickTitle] = useState('Quick Meeting');
  const [quickAgenda, setQuickAgenda] = useState('');
  const [quickMode, setQuickMode] = useState<'CHAT' | 'PRESENTATION' | 'VIDEO'>('VIDEO');
  const [quickAttendees, setQuickAttendees] = useState<string[]>([]);
  const [quickMemberAttendees, setQuickMemberAttendees] = useState<string[]>([]);
  const [startingQuick, setStartingQuick] = useState(false);

  useEffect(() => {
    Promise.all([meetingsApi.list(), agentsApi.list(), membersApi.list()])
      .then(([{ meetings }, { agents }, { members }]) => {
        setMeetingList(meetings);
        setAgentList(agents);
        setMemberList(members.filter(m => m.status === 'ACTIVE'));
      })
      .finally(() => setLoading(false));
  }, []);

  const resetForm = () => {
    setTitle(''); setMode('CHAT'); setLeadAgentId('');
    setInviteAll(true); setSelectedAgents([]); setAgendaItems(['']);
    setSelectedMemberIds([]); setScheduledAtPrefill('');
  };

  const createMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    const filteredAgenda = agendaItems.filter(a => a.trim());
    if (!filteredAgenda.length || !leadAgentId) return;
    const agentIds = inviteAll ? agentList.map(a => a.id) : [...new Set([...selectedAgents, leadAgentId])];
    const mbrIds = inviteAll ? memberList.map(m => m.id) : selectedMemberIds;
    setCreating(true);
    try {
      const { meeting } = await meetingsApi.create({
        title, agenda: filteredAgenda, agentIds, memberIds: mbrIds, mode, leadAgentId,
        scheduledAt: scheduledAtPrefill ? new Date(scheduledAtPrefill).toISOString() : undefined,
      });
      if (meeting.mode === 'VIDEO') { navigate(`/video-call/${meeting.id}`); return; }
      setMeetingList(prev => [meeting, ...prev]);
      resetForm(); setShowCreate(false);
    } finally { setCreating(false); }
  };

  const runMeeting = async (id: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setRunning(id);
    try {
      const { meeting } = await meetingsApi.run(id);
      setMeetingList(prev => prev.map(m => m.id === id ? meeting : m));
      setSelectedMeeting(prev => prev?.id === id ? meeting : prev);
    } finally { setRunning(null); }
  };

  const openQuickStart = () => {
    setQuickTitle('Quick Meeting'); setQuickAgenda(''); setQuickMode('CHAT');
    setQuickAttendees(agentList.map(a => a.id));
    setQuickMemberAttendees(memberList.map(m => m.id));
    setShowQuickStart(true);
  };

  const startQuickMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAttendees.length) return;
    setStartingQuick(true);
    try {
      const { meeting } = await meetingsApi.create({
        title: quickTitle.trim() || 'Quick Meeting',
        agenda: [quickAgenda.trim() || 'Open discussion'],
        agentIds: quickAttendees,
        memberIds: quickMemberAttendees,
        mode: quickMode,
        leadAgentId: quickAttendees[0],
      });
      if (quickMode === 'VIDEO') navigate(`/video-call/${meeting.id}`);
      else navigate(`/meeting-room/${meeting.id}`, { state: { autoRun: true } });
    } catch { setStartingQuick(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full min-h-[60vh]">
      <Loader2 size={24} className="animate-spin text-green-500" />
    </div>
  );

  // ── Calendar data ──────────────────────────────────────────────────────────

  const weekDays = getWeekDays(weekOffset);
  const now = new Date();
  const nowFrac = now.getHours() + now.getMinutes() / 60;
  const todayColIdx = weekDays.findIndex(d => isToday(d));

  const ws = weekDays[0], we = weekDays[6];
  const weekLabel = ws.getMonth() === we.getMonth()
    ? `${MONTHS[ws.getMonth()]} ${ws.getDate()}–${we.getDate()}, ${ws.getFullYear()}`
    : `${MONTHS[ws.getMonth()]} ${ws.getDate()} – ${MONTHS[we.getMonth()]} ${we.getDate()}, ${ws.getFullYear()}`;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col overflow-hidden bg-white">

      {/* Page header */}
      <div className="flex items-center justify-between px-8 pt-7 pb-4 border-b border-gray-100 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            <span className="gradient-text">Calendar</span>
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Schedule and track your team's meetings</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={openQuickStart}
            className="flex items-center gap-2 text-white font-semibold px-5 py-2.5 rounded-full shadow-sm hover:opacity-90 active:scale-95 transition-all text-sm"
            style={{ background: 'linear-gradient(to right, #89dba8, #a8d97a)' }}
          >
            <Video size={15} /> Quick Meeting
          </button>
          <button className="btn-primary flex items-center gap-2" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> Schedule
          </button>
        </div>
      </div>

      {/* Week navigation */}
      <div className="flex items-center gap-3 px-8 py-3 border-b border-gray-100 flex-shrink-0">
        <button
          onClick={() => setWeekOffset(o => o - 1)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 font-medium transition-colors px-2 py-1 rounded-lg hover:bg-gray-100"
        >
          <ChevronLeft size={16} /> Prev
        </button>
        <span className="text-sm font-semibold text-gray-900 min-w-[240px] text-center">{weekLabel}</span>
        <button
          onClick={() => setWeekOffset(o => o + 1)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 font-medium transition-colors px-2 py-1 rounded-lg hover:bg-gray-100"
        >
          Next <ChevronRight size={16} />
        </button>
        {weekOffset !== 0 && (
          <button
            onClick={() => setWeekOffset(0)}
            className="text-xs text-[#3db87a] font-semibold hover:underline ml-1 px-2 py-1 rounded-lg hover:bg-green-50 transition-colors"
          >
            Today
          </button>
        )}
      </div>

      {/* ── Weekly calendar grid ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* Day-name header — sticky */}
        <div className="flex sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
          <div className="w-16 flex-shrink-0 border-r border-gray-100" />
          {weekDays.map((day, i) => (
            <div
              key={i}
              className={`flex-1 py-3 text-center border-l border-gray-100 ${isToday(day) ? 'bg-green-50' : ''}`}
            >
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{DAY_NAMES[i]}</p>
              <p className={`text-lg font-bold mt-0.5 w-8 h-8 mx-auto flex items-center justify-center rounded-full ${
                isToday(day) ? 'bg-[#3db87a] text-white' : 'text-gray-900'
              }`}>
                {day.getDate()}
              </p>
            </div>
          ))}
        </div>

        {/* Hour rows */}
        <div className="relative">
          {HOURS.map(hour => (
            <div key={hour} className="flex" style={{ height: ROW_H }}>

              {/* Hour label */}
              <div className="w-16 flex-shrink-0 flex items-start pt-1.5 justify-end pr-3 border-r border-gray-100">
                <span className="text-[11px] text-gray-400">{pad(hour)}:00</span>
              </div>

              {/* Day cells */}
              {weekDays.map((day, dayIdx) => {
                const slotMeetings = getMeetingsForSlot(meetingList, day, hour);
                const isTodayCol = todayColIdx === dayIdx;
                const isCurrentHour = isTodayCol && weekOffset === 0 && Math.floor(nowFrac) === hour;

                return (
                  <div
                    key={dayIdx}
                    className={`flex-1 border-l border-t border-gray-100 relative cursor-pointer transition-colors group ${
                      isTodayCol ? 'bg-green-50/25 hover:bg-green-50/50' : 'hover:bg-gray-50/70'
                    }`}
                    onClick={() => {
                      setScheduledAtPrefill(toDatetimeLocal(day, hour));
                      setShowCreate(true);
                    }}
                  >
                    {/* "+" hover hint for empty cells */}
                    {slotMeetings.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <Plus size={14} className="text-gray-300" />
                      </div>
                    )}

                    {/* Current-time indicator */}
                    {isCurrentHour && (
                      <div
                        className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                        style={{ top: `${(nowFrac - Math.floor(nowFrac)) * 100}%` }}
                      >
                        <div className="w-2.5 h-2.5 rounded-full bg-red-400 flex-shrink-0 -ml-1.5 shadow-sm" />
                        <div className="h-px bg-red-400 flex-1 opacity-70" />
                      </div>
                    )}

                    {/* Meeting cards */}
                    {slotMeetings.map(meeting => {
                      const isVideo = meeting.mode === 'VIDEO';
                      const isPresentation = meeting.mode === 'PRESENTATION';
                      const bg = meeting.status === 'COMPLETED'
                        ? 'linear-gradient(135deg, #dcfce7, #f0fdf4)'
                        : meeting.status === 'IN_PROGRESS'
                        ? 'linear-gradient(135deg, #cef5dd, #e4f9ce)'
                        : isVideo
                        ? 'linear-gradient(135deg, #ede9fe, #f5f3ff)'
                        : 'linear-gradient(135deg, #e0f2fe, #f0f9ff)';

                      return (
                        <div
                          key={meeting.id}
                          className="absolute inset-x-1 rounded-lg px-2 py-1.5 cursor-pointer hover:brightness-95 transition-all shadow-sm border border-white/60"
                          style={{ top: 3, bottom: 3, background: bg }}
                          onClick={e => { e.stopPropagation(); setSelectedMeeting(meeting); }}
                        >
                          <div className="flex items-center gap-1 mb-0.5">
                            {isVideo && <Video size={9} className="text-purple-500 flex-shrink-0" />}
                            {isPresentation && <Monitor size={9} className="text-blue-500 flex-shrink-0" />}
                            {!isVideo && !isPresentation && <MessageSquare size={9} className="text-green-600 flex-shrink-0" />}
                            <p className="text-[11px] font-semibold text-gray-800 truncate leading-tight">{meeting.title}</p>
                          </div>
                          <div className="flex -space-x-1">
                            {meeting.slots.slice(0, 4).map(slot => (
                              <img
                                key={slot.id}
                                src={slot.agent.avatarUrl}
                                alt={slot.agent.name}
                                className="w-3.5 h-3.5 rounded-full border border-white object-cover"
                              />
                            ))}
                            {meeting.slots.length > 4 && (
                              <div className="w-3.5 h-3.5 rounded-full bg-gray-200 border border-white flex items-center justify-center text-[8px] text-gray-500">
                                +{meeting.slots.length - 4}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Meeting detail modal ─────────────────────────────────────────────── */}
      {selectedMeeting && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4">
          <div className="card p-6 w-full max-w-sm">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0 mr-3">
                <h3 className="font-semibold text-gray-900 leading-snug">{selectedMeeting.title}</h3>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(selectedMeeting.scheduledAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  {' · '}
                  {new Date(selectedMeeting.scheduledAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <button onClick={() => setSelectedMeeting(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <MeetingStatusBadge status={selectedMeeting.status} />
              {selectedMeeting.mode === 'VIDEO' && (
                <span className="badge bg-purple-100 text-purple-700 flex items-center gap-1"><Camera size={10} /> Video</span>
              )}
              {selectedMeeting.mode === 'PRESENTATION' && (
                <span className="badge bg-blue-100 text-blue-700 flex items-center gap-1"><Monitor size={10} /> Presentation</span>
              )}
              {(!selectedMeeting.mode || selectedMeeting.mode === 'CHAT') && (
                <span className="badge bg-green-100 text-green-700 flex items-center gap-1"><MessageSquare size={10} /> Chat</span>
              )}
            </div>

            {selectedMeeting.agenda.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-medium text-gray-500 mb-1.5">Agenda</p>
                <ul className="space-y-1">
                  {selectedMeeting.agenda.map((item, i) => (
                    <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                      <span className="text-[#89dba8] font-bold mt-0.5 flex-shrink-0">·</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex -space-x-2 mb-5">
              {selectedMeeting.slots.slice(0, 7).map(slot => (
                <img key={slot.id} src={slot.agent.avatarUrl} alt={slot.agent.name}
                  title={slot.agent.name}
                  className="w-8 h-8 rounded-full border-2 border-white object-cover" />
              ))}
              {selectedMeeting.slots.length > 7 && (
                <div className="w-8 h-8 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-xs text-gray-500">
                  +{selectedMeeting.slots.length - 7}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              {selectedMeeting.status === 'SCHEDULED' && (
                <button
                  onClick={e => runMeeting(selectedMeeting.id, e)}
                  disabled={running === selectedMeeting.id}
                  className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm"
                >
                  {running === selectedMeeting.id
                    ? <><Loader2 size={14} className="animate-spin" /> Running…</>
                    : <><Play size={14} /> Run meeting</>}
                </button>
              )}
              {selectedMeeting.status === 'IN_PROGRESS' && (
                <Link
                  to={selectedMeeting.mode === 'VIDEO' ? `/video-call/${selectedMeeting.id}` : `/meeting-room/${selectedMeeting.id}`}
                  className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm"
                >
                  <Play size={14} /> Join
                </Link>
              )}
              {selectedMeeting.status === 'COMPLETED' && (
                <Link
                  to={`/meetings/${selectedMeeting.id}/summary`}
                  className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold text-white py-2.5 rounded-full"
                  style={{ background: 'linear-gradient(to right, #89dba8, #a8d97a)' }}
                >
                  <Sparkles size={14} /> View Summary
                </Link>
              )}
              <button onClick={() => setSelectedMeeting(null)} className="btn-secondary px-4 text-sm">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Quick start modal ────────────────────────────────────────────────── */}
      {showQuickStart && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4">
          <div className="card p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Video size={16} className="text-[#3db87a]" />
                <h2 className="font-semibold text-gray-900">Quick Meeting</h2>
              </div>
              <button className="text-gray-400 hover:text-gray-600 transition-colors" onClick={() => setShowQuickStart(false)}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={startQuickMeeting} className="space-y-4">
              <div>
                <label className="label">Meeting title</label>
                <input className="input" placeholder="Quick Meeting"
                  value={quickTitle} onChange={e => setQuickTitle(e.target.value)} />
              </div>
              <div>
                <label className="label">What do you want to discuss?</label>
                <input className="input" placeholder="Open discussion topic…"
                  value={quickAgenda} onChange={e => setQuickAgenda(e.target.value)} />
              </div>
              <div>
                <label className="label">Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: 'VIDEO', icon: Camera, label: 'Video Call' },
                    { value: 'CHAT', icon: MessageSquare, label: 'Chat' },
                    { value: 'PRESENTATION', icon: Monitor, label: 'Presentation' },
                  ] as const).map(({ value, icon: Icon, label }) => (
                    <button key={value} type="button"
                      className={`flex items-center gap-1.5 p-2.5 rounded-xl border-2 text-xs font-medium transition-all ${
                        quickMode === value ? 'border-green-400 bg-green-50 text-green-700' : 'border-gray-100 bg-white text-gray-600 hover:border-gray-200'
                      }`}
                      onClick={() => setQuickMode(value)}>
                      <Icon size={13} /> {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Attendees</label>
                <div className="flex flex-wrap gap-2">
                  {memberList.map(member => {
                    const selected = quickMemberAttendees.includes(member.id);
                    return (
                      <button key={member.id} type="button" title={`${member.name} (Human)`}
                        onClick={() => setQuickMemberAttendees(prev => prev.includes(member.id) ? prev.filter(a => a !== member.id) : [...prev, member.id])}
                        className="relative flex-shrink-0">
                        {member.photoUrl
                          ? <img src={member.photoUrl} alt={member.name} className={`w-9 h-9 rounded-full object-cover border-2 transition-all ${selected ? 'border-blue-400' : 'border-gray-200 opacity-40'}`} />
                          : <div className={`w-9 h-9 rounded-full gradient-bg flex items-center justify-center text-white text-sm font-bold border-2 transition-all ${selected ? 'border-blue-400' : 'border-gray-200 opacity-40'}`}>{member.name.charAt(0).toUpperCase()}</div>
                        }
                        {selected && <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-blue-500 rounded-full border-2 border-white flex items-center justify-center"><Check size={8} className="text-white" strokeWidth={3} /></div>}
                      </button>
                    );
                  })}
                  {agentList.map(agent => {
                    const selected = quickAttendees.includes(agent.id);
                    return (
                      <button key={agent.id} type="button" title={agent.name}
                        onClick={() => setQuickAttendees(prev => prev.includes(agent.id) ? prev.filter(a => a !== agent.id) : [...prev, agent.id])}
                        className="relative flex-shrink-0">
                        <img src={agent.avatarUrl} alt={agent.name} className={`w-9 h-9 rounded-full object-cover border-2 transition-all ${selected ? 'border-green-400' : 'border-gray-200 opacity-40'}`} />
                        {selected && <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full border-2 border-white flex items-center justify-center"><Check size={8} className="text-white" strokeWidth={3} /></div>}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-2">{quickAttendees.length + quickMemberAttendees.length} attendee(s)</p>
              </div>
              <button type="submit" disabled={startingQuick || quickAttendees.length === 0}
                className="w-full text-white font-semibold py-3 rounded-full shadow-sm hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(to right, #89dba8, #a8d97a)' }}>
                {startingQuick ? <><Loader2 size={16} className="animate-spin" /> Starting…</> : <>Start Meeting →</>}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Create meeting modal ─────────────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4">
          <div className="card p-6 w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-gray-900">Schedule a meeting</h2>
              <button className="text-gray-400 hover:text-gray-600 transition-colors"
                onClick={() => { setShowCreate(false); resetForm(); }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={createMeeting} className="space-y-5">
              {/* Title */}
              <div>
                <label className="label">Meeting title</label>
                <input className="input" placeholder="Q1 Strategy Review"
                  value={title} onChange={e => setTitle(e.target.value)} required />
                <div className="flex flex-wrap gap-2 mt-2">
                  {[
                    { emoji: '👋', text: 'Kickoff Meeting' },
                    { emoji: '📊', text: 'Weekly Sync' },
                    { emoji: '🎯', text: 'Strategy Session' },
                    { emoji: '💡', text: 'Brainstorm' },
                    { emoji: '📈', text: 'Progress Review' },
                  ].map(chip => (
                    <button key={chip.text} type="button"
                      onClick={() => setTitle(`${chip.emoji} ${chip.text}`)}
                      className="text-xs px-3 py-1 rounded-full bg-white text-gray-600 hover:text-green-700 border border-green-100 hover:border-green-300 transition-colors">
                      {chip.emoji} {chip.text}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date/time */}
              <div>
                <label className="label">Date & time <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="datetime-local" className="input"
                  value={scheduledAtPrefill} onChange={e => setScheduledAtPrefill(e.target.value)} />
              </div>

              {/* Mode */}
              <div>
                <label className="label">Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: 'CHAT', icon: MessageSquare, label: 'Chat', desc: 'Agents discuss conversationally' },
                    { value: 'PRESENTATION', icon: Monitor, label: 'Presentation', desc: 'One presenter per topic' },
                    { value: 'VIDEO', icon: Camera, label: 'Video Call', desc: 'Zoom-style live call' },
                  ] as const).map(({ value, icon: Icon, label, desc }) => (
                    <button key={value} type="button"
                      className={`flex flex-col items-start gap-1.5 p-3 rounded-xl border-2 text-left transition-all ${
                        mode === value ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                      onClick={() => setMode(value)}>
                      <div className="flex items-center gap-2">
                        <Icon size={15} className={mode === value ? 'text-green-600' : 'text-gray-400'} />
                        <span className={`text-xs font-semibold ${mode === value ? 'text-green-700' : 'text-gray-700'}`}>{label}</span>
                      </div>
                      <p className="text-xs text-gray-400 leading-snug">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Lead */}
              <div>
                <label className="label">Meeting Lead</label>
                <div className="relative">
                  <select className="input appearance-none pr-8" value={leadAgentId}
                    onChange={e => {
                      setLeadAgentId(e.target.value);
                      if (!inviteAll && e.target.value && !selectedAgents.includes(e.target.value))
                        setSelectedAgents(prev => [...prev, e.target.value]);
                    }} required>
                    <option value="">Select a meeting lead…</option>
                    {agentList.map(a => <option key={a.id} value={a.id}>{a.name} — {a.role}</option>)}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-gray-400">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M6 8L1 3h10z" /></svg>
                  </div>
                </div>
              </div>

              {/* Attendees */}
              <div>
                <label className="label">Attendees</label>
                <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 mb-3 cursor-pointer select-none"
                  onClick={() => setInviteAll(v => !v)}>
                  <span className="text-sm text-gray-700">All team members</span>
                  <div className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${inviteAll ? 'bg-green-400' : 'bg-gray-200'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${inviteAll ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                </div>
                {inviteAll ? (
                  <div className="flex flex-wrap gap-2">
                    {memberList.map(member => (
                      <div key={member.id} className="relative flex-shrink-0">
                        {member.photoUrl
                          ? <img src={member.photoUrl} alt={member.name} title={`${member.name} (Human)`} className="w-9 h-9 rounded-full object-cover border-2 border-blue-400" />
                          : <div className="w-9 h-9 rounded-full gradient-bg flex items-center justify-center text-white text-sm font-bold border-2 border-blue-400">{member.name.charAt(0).toUpperCase()}</div>
                        }
                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-blue-500 rounded-full border-2 border-white flex items-center justify-center"><Check size={8} className="text-white" strokeWidth={3} /></div>
                      </div>
                    ))}
                    {agentList.map(a => (
                      <div key={a.id} className="relative flex-shrink-0">
                        <img src={a.avatarUrl} alt={a.name} title={a.name} className="w-9 h-9 rounded-full object-cover border-2 border-green-400" />
                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full border-2 border-white flex items-center justify-center"><Check size={8} className="text-white" strokeWidth={3} /></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {memberList.map(member => {
                      const sel = selectedMemberIds.includes(member.id);
                      return (
                        <button key={member.id} type="button" title={`${member.name} (Human)`}
                          onClick={() => setSelectedMemberIds(prev => prev.includes(member.id) ? prev.filter(a => a !== member.id) : [...prev, member.id])}
                          className="relative flex-shrink-0">
                          {member.photoUrl
                            ? <img src={member.photoUrl} alt={member.name} className={`w-9 h-9 rounded-full object-cover border-2 transition-all ${sel ? 'border-blue-400' : 'border-gray-200 opacity-50'}`} />
                            : <div className={`w-9 h-9 rounded-full gradient-bg flex items-center justify-center text-white text-sm font-bold border-2 transition-all ${sel ? 'border-blue-400' : 'border-gray-200 opacity-50'}`}>{member.name.charAt(0).toUpperCase()}</div>
                          }
                          {sel && <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-blue-500 rounded-full border-2 border-white flex items-center justify-center"><Check size={8} className="text-white" strokeWidth={3} /></div>}
                        </button>
                      );
                    })}
                    {agentList.map(agent => {
                      const isLead = agent.id === leadAgentId;
                      const isSel = selectedAgents.includes(agent.id) || isLead;
                      return (
                        <button key={agent.id} type="button" title={agent.name}
                          className={`relative flex-shrink-0 ${isLead ? 'cursor-default' : 'cursor-pointer'}`}
                          onClick={() => { if (!isLead) setSelectedAgents(prev => prev.includes(agent.id) ? prev.filter(a => a !== agent.id) : [...prev, agent.id]); }}>
                          <img src={agent.avatarUrl} alt={agent.name} className={`w-9 h-9 rounded-full object-cover border-2 transition-all ${isSel ? 'border-green-400' : 'border-gray-200 opacity-50'}`} />
                          {isSel && <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full border-2 border-white flex items-center justify-center"><Check size={8} className="text-white" strokeWidth={3} /></div>}
                          {isLead && <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-yellow-400 rounded-full border border-white" />}
                        </button>
                      );
                    })}
                  </div>
                )}
                {!inviteAll && (
                  <p className="text-xs text-gray-400 mt-2">
                    {[...new Set([...selectedAgents, leadAgentId].filter(Boolean))].length + selectedMemberIds.length} attendee(s)
                  </p>
                )}
              </div>

              {/* Agenda */}
              <div>
                <label className="label">Agenda topics</label>
                {agendaItems.map((item, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input className="input" placeholder={`Topic ${i + 1}`} value={item}
                      onChange={e => { const u = [...agendaItems]; u[i] = e.target.value; setAgendaItems(u); }} />
                    {agendaItems.length > 1 && (
                      <button type="button" className="text-gray-400 hover:text-gray-600 px-2 transition-colors"
                        onClick={() => setAgendaItems(agendaItems.filter((_, j) => j !== i))}>
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
                {agendaItems.length < 10 && (
                  <button type="button" className="text-sm text-green-600 hover:text-green-700 font-medium flex items-center gap-1 mt-1"
                    onClick={() => setAgendaItems([...agendaItems, ''])}>
                    <Plus size={13} /> Add topic
                  </button>
                )}
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" className="btn-secondary flex-1"
                  onClick={() => { setShowCreate(false); resetForm(); }}>Cancel</button>
                <button type="submit" className="btn-primary flex-1"
                  disabled={creating || !title.trim() || !leadAgentId || agendaItems.filter(a => a.trim()).length === 0}>
                  {creating ? <><Loader2 size={14} className="animate-spin inline mr-1.5" />Scheduling…</> : 'Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
