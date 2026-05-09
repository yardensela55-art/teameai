import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Send, ArrowLeft, Loader2, Plus, Users, MessageCircle, User, UserCheck,
} from 'lucide-react';
import { agents as agentsApi, chat as chatApi, members as membersApi } from '../lib/api';
import { isChiefOfStaff, COS_GLOW } from '../lib/chiefOfStaff';
import type { Agent, CompanyMember } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialAgentId?: string;
  initialMessage?: string;
}

interface GroupChatMsg {
  id: string;
  role: 'user' | 'agent';
  content: string;
  agentId?: string;
  agentName?: string;
  agentRole?: string;
  agentAvatar?: string;
}

interface SavedGroup {
  id: string;
  name: string;
  agentIds: string[];
}

type Tab = 'everyone' | 'direct' | 'groups';

const GROUPS_KEY = 'teame_chat_groups';
const loadGroups = (): SavedGroup[] => {
  try { return JSON.parse(localStorage.getItem(GROUPS_KEY) || '[]'); } catch { return []; }
};
const saveGroups = (g: SavedGroup[]) => localStorage.setItem(GROUPS_KEY, JSON.stringify(g));

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 mb-4">
      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
        <User size={14} className="text-gray-400" />
      </div>
      <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
        {[0, 1, 2].map(i => (
          <span key={i} className="w-1.5 h-1.5 bg-gray-400 rounded-full inline-block animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: GroupChatMsg }) {
  const isCos = msg.agentRole ? isChiefOfStaff({ role: msg.agentRole }) : false;

  if (msg.role === 'user') {
    return (
      <div className="flex justify-end mb-3">
        <div
          className="rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm text-green-900 max-w-[75%]"
          style={{ background: 'linear-gradient(to right, #cef5dd, #e4f9ce)' }}
        >
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2 mb-3">
      {msg.agentAvatar ? (
        <div className="flex-shrink-0 relative">
          <img
            src={msg.agentAvatar}
            alt={msg.agentName}
            className="w-8 h-8 rounded-full object-cover"
            style={isCos ? { boxShadow: COS_GLOW } : {}}
          />
        </div>
      ) : (
        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
          <User size={14} className="text-gray-400" />
        </div>
      )}
      <div className="max-w-[75%]">
        {msg.agentName && (
          <p className="text-xs mb-1">
            {isCos ? (
              <span className="font-bold gradient-text">✦ {msg.agentName}</span>
            ) : (
              <span className="text-gray-500">{msg.agentName}{msg.agentRole ? ` · ${msg.agentRole}` : ''}</span>
            )}
          </p>
        )}
        <div
          className="rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm text-gray-900"
          style={isCos
            ? { background: '#f9fffe', borderLeft: '3px solid #89dba8' }
            : { background: '#f3f4f6' }
          }
        >
          {msg.content}
        </div>
      </div>
    </div>
  );
}

export default function ChatDrawer({ isOpen, onClose, initialAgentId, initialMessage }: Props) {
  const [tab, setTab] = useState<Tab>('everyone');
  const [agentList, setAgentList] = useState<Agent[]>([]);
  const [memberList, setMemberList] = useState<CompanyMember[]>([]);
  const [selectedMember, setSelectedMember] = useState<CompanyMember | null>(null);

  const [everyoneMessages, setEveryoneMessages] = useState<GroupChatMsg[]>([]);
  const [everyoneInput, setEveryoneInput] = useState('');
  const [everyoneSending, setEveryoneSending] = useState(false);
  const everyoneEndRef = useRef<HTMLDivElement>(null);

  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [directMessages, setDirectMessages] = useState<Record<string, GroupChatMsg[]>>({});
  const [directInput, setDirectInput] = useState('');
  const [directSending, setDirectSending] = useState(false);
  const directEndRef = useRef<HTMLDivElement>(null);

  const [groups, setGroups] = useState<SavedGroup[]>(() => loadGroups());
  const [selectedGroup, setSelectedGroup] = useState<SavedGroup | null>(null);
  const [groupMessages, setGroupMessages] = useState<Record<string, GroupChatMsg[]>>({});
  const [groupInput, setGroupInput] = useState('');
  const [groupSending, setGroupSending] = useState(false);
  const groupEndRef = useRef<HTMLDivElement>(null);

  const [creatingGroup, setCreatingGroupMode] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupAgentIds, setNewGroupAgentIds] = useState<string[]>([]);

  // Load agents + members when drawer opens
  useEffect(() => {
    if (isOpen && agentList.length === 0) {
      agentsApi.list().then(({ agents }) => {
        const sorted = [...agents].sort((a, b) => {
          const aCos = isChiefOfStaff(a);
          const bCos = isChiefOfStaff(b);
          if (aCos && !bCos) return -1;
          if (!aCos && bCos) return 1;
          return a.name.localeCompare(b.name);
        });
        setAgentList(sorted);
      }).catch(() => {});
      membersApi.list().then(({ members }) => {
        setMemberList(members.filter(m => m.status === 'ACTIVE'));
      }).catch(() => {});
    }
  }, [isOpen, agentList.length]);

  const pendingAutoSendRef = useRef<string | null>(null);

  // Auto-select agent when initialAgentId is set
  useEffect(() => {
    if (!isOpen) return;
    if (initialAgentId) {
      setTab('direct');
      const found = agentList.find(a => a.id === initialAgentId);
      if (found) setSelectedAgent(found);
    }
  }, [isOpen, initialAgentId]);

  // When agents load and there's a pending initialAgentId
  useEffect(() => {
    if (isOpen && initialAgentId && agentList.length > 0) {
      const found = agentList.find(a => a.id === initialAgentId);
      if (found && (!selectedAgent || selectedAgent.id !== found.id)) {
        setTab('direct');
        setSelectedAgent(found);
      }
    }
  }, [agentList, isOpen, initialAgentId]);

  // Store pending auto-send message when initialMessage changes
  useEffect(() => {
    if (initialMessage && isOpen) {
      pendingAutoSendRef.current = initialMessage;
    }
  }, [initialMessage, isOpen]);

  // Fire auto-send when agent is selected and there's a pending message
  useEffect(() => {
    if (!selectedAgent || !pendingAutoSendRef.current) return;
    const message = pendingAutoSendRef.current;
    pendingAutoSendRef.current = null;
    const agentId = selectedAgent.id;
    const userMsg: GroupChatMsg = { id: crypto.randomUUID(), role: 'user', content: message };
    setDirectMessages(prev => ({ ...prev, [agentId]: [...(prev[agentId] ?? []), userMsg] }));
    setDirectSending(true);
    const history: { role: 'user' | 'assistant'; content: string }[] = [];
    agentsApi.chat(agentId, message, history)
      .then(({ reply, agentName }) => {
        const agentMsg: GroupChatMsg = {
          id: crypto.randomUUID(), role: 'agent', content: reply,
          agentId, agentName, agentRole: selectedAgent.role, agentAvatar: selectedAgent.avatarUrl,
        };
        setDirectMessages(prev => ({ ...prev, [agentId]: [...(prev[agentId] ?? []), agentMsg] }));
      })
      .catch(() => {})
      .finally(() => setDirectSending(false));
  }, [selectedAgent]);

  useEffect(() => { everyoneEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [everyoneMessages, everyoneSending]);
  useEffect(() => { directEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [directMessages, directSending]);
  useEffect(() => { groupEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [groupMessages, groupSending]);
  useEffect(() => { saveGroups(groups); }, [groups]);

  const sendEveryoneMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = everyoneInput.trim();
    if (!text || everyoneSending) return;
    const userMsg: GroupChatMsg = { id: crypto.randomUUID(), role: 'user', content: text };
    setEveryoneMessages(prev => [...prev, userMsg]);
    setEveryoneInput('');
    setEveryoneSending(true);
    try {
      const { responses } = await chatApi.group(text, [], true);
      const agentMsgs: GroupChatMsg[] = responses.map(r => ({
        id: crypto.randomUUID(), role: 'agent', content: r.reply,
        agentId: r.agentId, agentName: r.agentName, agentRole: r.agentRole, agentAvatar: r.agentAvatar,
      }));
      setEveryoneMessages(prev => [...prev, ...agentMsgs]);
    } catch { /* ignore */ } finally { setEveryoneSending(false); }
  };

  const sendDirectMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = directInput.trim();
    if (!text || !selectedAgent || directSending) return;
    const agentId = selectedAgent.id;
    const userMsg: GroupChatMsg = { id: crypto.randomUUID(), role: 'user', content: text };
    setDirectMessages(prev => ({ ...prev, [agentId]: [...(prev[agentId] ?? []), userMsg] }));
    setDirectInput('');
    setDirectSending(true);
    const history = (directMessages[agentId] ?? []).map(m => ({
      role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
    }));
    try {
      const { reply, agentName } = await agentsApi.chat(agentId, text, history);
      const agentMsg: GroupChatMsg = {
        id: crypto.randomUUID(), role: 'agent', content: reply,
        agentId, agentName, agentRole: selectedAgent.role, agentAvatar: selectedAgent.avatarUrl,
      };
      setDirectMessages(prev => ({ ...prev, [agentId]: [...(prev[agentId] ?? []), agentMsg] }));
    } catch { /* ignore */ } finally { setDirectSending(false); }
  };

  const sendGroupMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = groupInput.trim();
    if (!text || !selectedGroup || groupSending) return;
    const groupId = selectedGroup.id;
    const userMsg: GroupChatMsg = { id: crypto.randomUUID(), role: 'user', content: text };
    setGroupMessages(prev => ({ ...prev, [groupId]: [...(prev[groupId] ?? []), userMsg] }));
    setGroupInput('');
    setGroupSending(true);
    try {
      const { responses } = await chatApi.group(text, selectedGroup.agentIds, false);
      const agentMsgs: GroupChatMsg[] = responses.map(r => ({
        id: crypto.randomUUID(), role: 'agent', content: r.reply,
        agentId: r.agentId, agentName: r.agentName, agentRole: r.agentRole, agentAvatar: r.agentAvatar,
      }));
      setGroupMessages(prev => ({ ...prev, [groupId]: [...(prev[groupId] ?? []), ...agentMsgs] }));
    } catch { /* ignore */ } finally { setGroupSending(false); }
  };

  const createGroup = () => {
    if (!newGroupName.trim() || newGroupAgentIds.length === 0) return;
    const newGroup: SavedGroup = { id: crypto.randomUUID(), name: newGroupName.trim(), agentIds: newGroupAgentIds };
    setGroups(prev => [...prev, newGroup]);
    setCreatingGroupMode(false);
    setNewGroupName('');
    setNewGroupAgentIds([]);
    setSelectedGroup(newGroup);
  };

  const toggleNewGroupAgent = (id: string) => {
    setNewGroupAgentIds(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
  };

  const groupAgentAvatars = (group: SavedGroup) =>
    group.agentIds.slice(0, 3).map(id => agentList.find(a => a.id === id)).filter(Boolean) as Agent[];

  const tabStyle = (t: Tab) =>
    tab === t
      ? ({ style: { background: 'linear-gradient(to right, #cef5dd, #e4f9ce)' }, className: 'text-green-900 font-semibold px-4 py-1.5 rounded-full text-sm transition-all' } as const)
      : ({ style: {}, className: 'bg-gray-100 text-gray-600 px-4 py-1.5 rounded-full text-sm transition-all hover:bg-gray-200' } as const);

  // ── Agent row in Direct list ──
  const AgentRow = ({ agent }: { agent: Agent }) => {
    const cos = isChiefOfStaff(agent);
    return (
      <button
        onClick={() => setSelectedAgent(agent)}
        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors text-left border-b border-gray-100 last:border-0"
        style={cos ? { background: 'linear-gradient(to right, #f0fdf4, #f7fef0)' } : {}}
      >
        <div className="relative flex-shrink-0">
          <img
            src={agent.avatarUrl}
            alt={agent.name}
            className="w-10 h-10 rounded-full object-cover"
            style={cos ? { boxShadow: COS_GLOW } : {}}
          />
          {cos && (
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-white" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          {cos ? (
            <p className="text-sm font-bold gradient-text truncate flex items-center gap-1">
              ✦ {agent.name}
              <span className="text-xs text-gray-400 font-normal ml-1">📌</span>
            </p>
          ) : (
            <p className="text-sm font-medium text-gray-900 truncate">{agent.name}</p>
          )}
          <p className="text-xs text-gray-500 truncate">{agent.role}</p>
        </div>
      </button>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div key="backdrop" className="fixed inset-0 bg-black/20 z-40"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />

          <motion.div key="drawer"
            className="fixed top-0 right-0 bottom-0 w-[420px] bg-white shadow-2xl z-50 flex flex-col border-l border-gray-200"
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
              <span className="font-semibold text-gray-900">Team Chat</span>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-200 flex-shrink-0">
              {(['everyone', 'direct', 'groups'] as Tab[]).map(t => {
                const { style, className } = tabStyle(t);
                const labels: Record<Tab, string> = { everyone: 'Everyone', direct: 'Direct', groups: 'Groups' };
                return (
                  <button key={t} onClick={() => setTab(t)} className={className} style={style}>
                    {labels[t]}
                  </button>
                );
              })}
            </div>

            {/* ── Everyone Tab ── */}
            {tab === 'everyone' && (
              <>
                <div className="flex-1 overflow-y-auto px-5 py-4">
                  {everyoneMessages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-12">
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                        <Users size={22} className="text-gray-400" />
                      </div>
                      <p className="text-sm text-gray-500">Send a message to your entire team</p>
                    </div>
                  )}
                  {everyoneMessages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
                  {everyoneSending && <TypingIndicator />}
                  <div ref={everyoneEndRef} />
                </div>
                <form onSubmit={sendEveryoneMessage} className="px-5 py-4 border-t border-gray-200 flex gap-2 flex-shrink-0">
                  <input className="input flex-1" placeholder="Message your team…" value={everyoneInput}
                    onChange={e => setEveryoneInput(e.target.value)} disabled={everyoneSending} />
                  <button type="submit" disabled={everyoneSending || !everyoneInput.trim()} className="btn-primary px-3 py-2 flex items-center justify-center">
                    {everyoneSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </form>
              </>
            )}

            {/* ── Direct Tab ── */}
            {tab === 'direct' && (
              <>
                {!selectedAgent && !selectedMember ? (
                  <div className="flex-1 overflow-y-auto">
                    {agentList.length === 0 ? (
                      <div className="flex items-center justify-center h-full py-12">
                        <Loader2 size={20} className="animate-spin text-gray-400" />
                      </div>
                    ) : (
                      <>
                        {memberList.length > 0 && (
                          <>
                            <p className="px-5 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-widest">People</p>
                            {memberList.map(member => {
                              const roleColor = member.role === 'PARTNER' ? '#d97706' : '#2563eb';
                              const roleLabel = member.role === 'PARTNER' ? 'Partner' : 'Employee';
                              return (
                                <button key={member.id} onClick={() => setSelectedMember(member)}
                                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors text-left border-b border-gray-100 last:border-0">
                                  {member.photoUrl ? (
                                    <img src={member.photoUrl} alt={member.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                                  ) : (
                                    <div className="w-10 h-10 rounded-full gradient-bg flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                                      {member.name.charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-gray-900 truncate">{member.name}</p>
                                    <p className="text-xs truncate" style={{ color: roleColor }}>{roleLabel}</p>
                                  </div>
                                  <UserCheck size={13} className="text-green-400 flex-shrink-0" />
                                </button>
                              );
                            })}
                          </>
                        )}
                        <p className="px-5 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-widest">AI Team</p>
                        {agentList.map(agent => <AgentRow key={agent.id} agent={agent} />)}
                      </>
                    )}
                  </div>
                ) : selectedMember ? (
                  <>
                    <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 flex-shrink-0">
                      <button onClick={() => setSelectedMember(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <ArrowLeft size={18} />
                      </button>
                      {selectedMember.photoUrl ? (
                        <img src={selectedMember.photoUrl} alt={selectedMember.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full gradient-bg flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                          {selectedMember.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{selectedMember.name}</p>
                        <p className="text-xs text-gray-500 truncate">{selectedMember.role === 'PARTNER' ? 'Partner' : 'Employee'}</p>
                      </div>
                    </div>
                    <div className="flex-1 flex flex-col items-center justify-center px-5 text-center gap-4 py-12">
                      {selectedMember.photoUrl ? (
                        <img src={selectedMember.photoUrl} alt={selectedMember.name} className="w-20 h-20 rounded-full object-cover" />
                      ) : (
                        <div className="w-20 h-20 rounded-full gradient-bg flex items-center justify-center text-white text-3xl font-bold">
                          {selectedMember.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-gray-900">{selectedMember.name}</p>
                        <p className="text-sm text-gray-400 mt-0.5">{selectedMember.email}</p>
                      </div>
                      <div className="bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 max-w-xs">
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <UserCheck size={15} className="text-green-500" />
                          <p className="text-sm font-medium text-gray-700">Real person</p>
                        </div>
                        <p className="text-xs text-gray-500 leading-relaxed">
                          {selectedMember.name} is a human team member. They'll see messages and tasks when they log in — no AI response is generated.
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 flex-shrink-0"
                      style={selectedAgent && isChiefOfStaff(selectedAgent) ? { background: 'linear-gradient(to right, #f0fdf4, #f7fef0)' } : {}}>
                      <button onClick={() => setSelectedAgent(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <ArrowLeft size={18} />
                      </button>
                      {selectedAgent && (
                        <>
                          <img src={selectedAgent.avatarUrl} alt={selectedAgent.name}
                            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                            style={isChiefOfStaff(selectedAgent) ? { boxShadow: COS_GLOW } : {}} />
                          <div className="min-w-0">
                            {isChiefOfStaff(selectedAgent) ? (
                              <p className="text-sm font-bold gradient-text truncate">✦ {selectedAgent.name}</p>
                            ) : (
                              <p className="text-sm font-semibold text-gray-900 truncate">{selectedAgent.name}</p>
                            )}
                            <p className="text-xs text-gray-500 truncate">{selectedAgent.role}</p>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex-1 overflow-y-auto px-5 py-4">
                      {selectedAgent && (directMessages[selectedAgent.id] ?? []).length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-12">
                          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                            <MessageCircle size={22} className="text-gray-400" />
                          </div>
                          <p className="text-sm text-gray-500">Start a conversation with {selectedAgent?.name}</p>
                        </div>
                      )}
                      {selectedAgent && (directMessages[selectedAgent.id] ?? []).map(msg => <MessageBubble key={msg.id} msg={msg} />)}
                      {directSending && <TypingIndicator />}
                      <div ref={directEndRef} />
                    </div>

                    <form onSubmit={sendDirectMessage} className="px-5 py-4 border-t border-gray-200 flex gap-2 flex-shrink-0">
                      <input className="input flex-1" placeholder={`Message ${selectedAgent?.name}…`}
                        value={directInput} onChange={e => setDirectInput(e.target.value)} disabled={directSending} />
                      <button type="submit" disabled={directSending || !directInput.trim()} className="btn-primary px-3 py-2 flex items-center justify-center">
                        {directSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                      </button>
                    </form>
                  </>
                )}
              </>
            )}

            {/* ── Groups Tab ── */}
            {tab === 'groups' && (
              <>
                {!selectedGroup && !creatingGroup && (
                  <>
                    <div className="flex-1 overflow-y-auto">
                      {groups.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-12">
                          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                            <Users size={22} className="text-gray-400" />
                          </div>
                          <p className="text-sm text-gray-500">No groups yet</p>
                        </div>
                      ) : (
                        groups.map(group => {
                          const avatars = groupAgentAvatars(group);
                          return (
                            <button key={group.id} onClick={() => setSelectedGroup(group)}
                              className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors text-left border-b border-gray-100 last:border-0">
                              <div className="flex -space-x-2 flex-shrink-0">
                                {avatars.length > 0 ? avatars.map(a => (
                                  <img key={a.id} src={a.avatarUrl} alt={a.name}
                                    className="w-8 h-8 rounded-full object-cover border-2 border-white" />
                                )) : (
                                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                                    <Users size={14} className="text-gray-400" />
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{group.name}</p>
                                <p className="text-xs text-gray-500">{group.agentIds.length} member{group.agentIds.length !== 1 ? 's' : ''}</p>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                    <div className="px-5 py-4 border-t border-gray-200 flex-shrink-0">
                      <button className="btn-secondary w-full flex items-center justify-center gap-2" onClick={() => setCreatingGroupMode(true)}>
                        <Plus size={15} /> New Group
                      </button>
                    </div>
                  </>
                )}

                {creatingGroup && (
                  <>
                    <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 flex-shrink-0">
                      <button onClick={() => { setCreatingGroupMode(false); setNewGroupName(''); setNewGroupAgentIds([]); }}
                        className="text-gray-400 hover:text-gray-600 transition-colors">
                        <ArrowLeft size={18} />
                      </button>
                      <span className="text-sm font-semibold text-gray-900">New Group</span>
                    </div>
                    <div className="flex-1 overflow-y-auto px-5 py-4">
                      <div className="mb-4">
                        <label className="label">Group name</label>
                        <input className="input" placeholder="e.g. Marketing Team" value={newGroupName}
                          onChange={e => setNewGroupName(e.target.value)} />
                      </div>
                      <div>
                        <label className="label">Select agents</label>
                        {agentList.length === 0 ? (
                          <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
                        ) : (
                          <div className="space-y-1">
                            {agentList.map(agent => {
                              const checked = newGroupAgentIds.includes(agent.id);
                              const cos = isChiefOfStaff(agent);
                              return (
                                <label key={agent.id}
                                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                                  <input type="checkbox" checked={checked} onChange={() => toggleNewGroupAgent(agent.id)}
                                    className="accent-green-500 w-4 h-4 flex-shrink-0" />
                                  <img src={agent.avatarUrl} alt={agent.name}
                                    className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                                    style={cos ? { boxShadow: COS_GLOW } : {}} />
                                  <div className="min-w-0">
                                    {cos ? (
                                      <p className="text-sm font-bold gradient-text truncate">✦ {agent.name}</p>
                                    ) : (
                                      <p className="text-sm font-medium text-gray-900 truncate">{agent.name}</p>
                                    )}
                                    <p className="text-xs text-gray-500 truncate">{agent.role}</p>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="px-5 py-4 border-t border-gray-200 flex-shrink-0">
                      <button className="btn-primary w-full" disabled={!newGroupName.trim() || newGroupAgentIds.length === 0} onClick={createGroup}>
                        Create Group
                      </button>
                    </div>
                  </>
                )}

                {selectedGroup && (
                  <>
                    <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 flex-shrink-0">
                      <button onClick={() => setSelectedGroup(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <ArrowLeft size={18} />
                      </button>
                      <div className="flex -space-x-2 flex-shrink-0">
                        {groupAgentAvatars(selectedGroup).map(a => (
                          <img key={a.id} src={a.avatarUrl} alt={a.name}
                            className="w-7 h-7 rounded-full object-cover border-2 border-white" />
                        ))}
                        {groupAgentAvatars(selectedGroup).length === 0 && (
                          <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center">
                            <Users size={12} className="text-gray-400" />
                          </div>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-gray-900 truncate">{selectedGroup.name}</p>
                    </div>
                    <div className="flex-1 overflow-y-auto px-5 py-4">
                      {(groupMessages[selectedGroup.id] ?? []).length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-12">
                          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                            <Users size={22} className="text-gray-400" />
                          </div>
                          <p className="text-sm text-gray-500">Start the conversation in {selectedGroup.name}</p>
                        </div>
                      )}
                      {(groupMessages[selectedGroup.id] ?? []).map(msg => <MessageBubble key={msg.id} msg={msg} />)}
                      {groupSending && <TypingIndicator />}
                      <div ref={groupEndRef} />
                    </div>
                    <form onSubmit={sendGroupMessage} className="px-5 py-4 border-t border-gray-200 flex gap-2 flex-shrink-0">
                      <input className="input flex-1" placeholder={`Message ${selectedGroup.name}…`}
                        value={groupInput} onChange={e => setGroupInput(e.target.value)} disabled={groupSending} />
                      <button type="submit" disabled={groupSending || !groupInput.trim()} className="btn-primary px-3 py-2 flex items-center justify-center">
                        {groupSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                      </button>
                    </form>
                  </>
                )}
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
