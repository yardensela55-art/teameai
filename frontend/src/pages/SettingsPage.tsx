import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { company as companyApi, agents as agentsApi, members as membersApi, integrations as integrationsApi } from '../lib/api';
import type { Agent, Company, CompanyMode, CompanyMember } from '../types';
import { Pencil, Trash2, Plus, X, Check, Loader2, Mail, UserCheck, Clock } from 'lucide-react';

type Section = 'company' | 'team' | 'integrations' | 'sounds' | 'account';

const AVATAR_URLS = [
  'https://randomuser.me/api/portraits/women/1.jpg',
  'https://randomuser.me/api/portraits/men/1.jpg',
  'https://randomuser.me/api/portraits/women/2.jpg',
  'https://randomuser.me/api/portraits/men/2.jpg',
  'https://randomuser.me/api/portraits/women/3.jpg',
  'https://randomuser.me/api/portraits/men/3.jpg',
  'https://randomuser.me/api/portraits/women/4.jpg',
  'https://randomuser.me/api/portraits/men/4.jpg',
  'https://randomuser.me/api/portraits/women/5.jpg',
  'https://randomuser.me/api/portraits/men/5.jpg',
  'https://randomuser.me/api/portraits/women/6.jpg',
  'https://randomuser.me/api/portraits/men/6.jpg',
  'https://randomuser.me/api/portraits/women/7.jpg',
  'https://randomuser.me/api/portraits/men/7.jpg',
  'https://randomuser.me/api/portraits/women/8.jpg',
  'https://randomuser.me/api/portraits/men/8.jpg',
  'https://randomuser.me/api/portraits/women/9.jpg',
  'https://randomuser.me/api/portraits/men/9.jpg',
  'https://randomuser.me/api/portraits/women/10.jpg',
  'https://randomuser.me/api/portraits/men/10.jpg',
];

const INDUSTRIES = [
  'Technology', 'Healthcare', 'Finance', 'Education', 'E-commerce',
  'Media & Entertainment', 'Manufacturing', 'Real Estate', 'Consulting', 'Other',
];

const tabs: { id: Section; label: string }[] = [
  { id: 'company', label: 'Company' },
  { id: 'team', label: 'Team' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'sounds', label: 'Sounds' },
  { id: 'account', label: 'Account' },
];

// ── Management Style mini-cards ───────────────────────────────────────────────
const MODE_OPTIONS: { value: CompanyMode; icon: string; title: string; desc: string }[] = [
  {
    value: 'CEO',
    icon: '👔',
    title: 'CEO Mode',
    desc: 'Full control — manage tasks, meetings, and every team member directly.',
  },
  {
    value: 'FOUNDER',
    icon: '🧘',
    title: 'Founder Mode',
    desc: 'Your Chief of Staff runs the day-to-day. You make the big calls.',
  },
];

// ── Company Section ──────────────────────────────────────────────────────────
function CompanySection() {
  const [companyData, setCompanyData] = useState<Company | null>(null);
  const [form, setForm] = useState({ companyName: '', industry: '', description: '', vision: '' });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Management style state
  const [currentMode, setCurrentMode] = useState<CompanyMode>('CEO');
  const [modeSaving, setModeSaving] = useState(false);
  const [modeSaved, setModeSaved] = useState(false);

  useEffect(() => {
    companyApi.get().then(({ company }) => {
      setCompanyData(company);
      setCurrentMode(company.mode ?? 'CEO');
      setForm({
        companyName: company.name,
        industry: company.industry,
        description: company.description,
        vision: company.vision,
      });
    }).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const { company } = await companyApi.update(form);
      setCompanyData(company);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const switchMode = async (mode: CompanyMode) => {
    if (mode === currentMode || modeSaving) return;
    setModeSaving(true);
    setModeSaved(false);
    try {
      await companyApi.update({ mode });
      setCurrentMode(mode);
      setModeSaved(true);
      setTimeout(() => setModeSaved(false), 2500);
      // Clear morning briefing cache so sidebar/dashboard refresh
      Object.keys(localStorage)
        .filter(k => k.startsWith('teame_alex_briefing_'))
        .forEach(k => localStorage.removeItem(k));
      // Signal Layout to re-fetch agents (shows/hides Alex strip)
      window.dispatchEvent(new CustomEvent('teame:agents-changed'));
    } finally {
      setModeSaving(false);
    }
  };

  if (!companyData) return <div className="text-gray-400 text-sm">Loading…</div>;

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 tracking-tight mb-1">Company</h2>
      <p className="text-sm text-gray-400 mb-8">Update your company information and details.</p>

      <form onSubmit={handleSubmit} className="space-y-5 max-w-lg">
        <div>
          <label className="label">Company name</label>
          <input
            className="input"
            value={form.companyName}
            onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))}
            placeholder="Acme Inc."
          />
        </div>
        <div>
          <label className="label">Industry</label>
          <select
            className="input"
            value={form.industry}
            onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
          >
            <option value="">Select industry…</option>
            {INDUSTRIES.map(i => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Description</label>
          <textarea
            className="input min-h-[80px] resize-none"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="What does your company do?"
            rows={3}
          />
        </div>
        <div>
          <label className="label">Vision</label>
          <textarea
            className="input min-h-[80px] resize-none"
            value={form.vision}
            onChange={e => setForm(f => ({ ...f, vision: e.target.value }))}
            placeholder="What's your company's vision?"
            rows={3}
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-2xl px-4 py-2">{error}</p>
        )}
        {success && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-2xl px-4 py-2 flex items-center gap-2">
            <Check size={14} /> Saved successfully
          </p>
        )}

        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>

      {/* ── Management Style ── */}
      <div className="max-w-lg mt-10 pt-8 border-t border-gray-100">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-gray-900">Management Style</h3>
          {modeSaving && <Loader2 size={14} className="text-gray-400 animate-spin" />}
          {modeSaved && !modeSaving && (
            <span className="text-xs text-green-600 font-medium flex items-center gap-1">
              <Check size={12} /> Saved
            </span>
          )}
        </div>
        <p className="text-sm text-gray-400 mb-4">Choose how you run your company. Takes effect immediately.</p>

        <div className="grid grid-cols-2 gap-3">
          {MODE_OPTIONS.map(opt => {
            const selected = currentMode === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => switchMode(opt.value)}
                disabled={modeSaving}
                className={`text-left rounded-2xl border-2 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed ${
                  selected ? 'shadow-sm' : 'border-gray-100 bg-white hover:border-gray-200'
                }`}
                style={selected ? {
                  borderColor: 'transparent',
                  backgroundImage: 'linear-gradient(white, white), linear-gradient(to right, #89dba8, #a8d97a)',
                  backgroundOrigin: 'border-box',
                  backgroundClip: 'padding-box, border-box',
                } : {}}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">{opt.icon}</span>
                  <span className="font-semibold text-gray-900 text-sm">{opt.title}</span>
                  {selected && (
                    <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ background: 'linear-gradient(to right, #89dba8, #a8d97a)' }}>
                      Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Team Section ─────────────────────────────────────────────────────────────
function TeamSection() {
  const { user } = useAuth();
  const [agentsList, setAgentsList] = useState<Agent[]>([]);
  const [membersList, setMembersList] = useState<CompanyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [editForm, setEditForm] = useState({ name: '', role: '', department: '', bio: '', personality: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '', role: '', department: '', background: '', personality: '', hobby: '',
    avatarUrl: AVATAR_URLS[1],
  });
  const [addSaving, setAddSaving] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteSelectedRole, setInviteSelectedRole] = useState<'PARTNER' | 'EMPLOYEE' | null>(null);
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', photoUrl: '' });
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadAll = () => {
    Promise.all([agentsApi.list(), membersApi.list()])
      .then(([{ agents }, { members }]) => {
        setAgentsList(agents);
        setMembersList(members);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadAll(); }, []);

  const openEdit = (agent: Agent) => {
    setEditAgent(agent);
    setEditForm({
      name: agent.name,
      role: agent.role,
      department: agent.department,
      bio: agent.bio || '',
      personality: agent.personality || '',
    });
  };

  const handleEditSave = async () => {
    if (!editAgent) return;
    setEditSaving(true);
    try {
      const { agent } = await agentsApi.update(editAgent.id, editForm);
      setAgentsList(list => list.map(a => a.id === agent.id ? agent : a));
      setEditAgent(null);
    } catch {
      // ignore
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (agent: Agent) => {
    if (!confirm(`Delete ${agent.name}? This cannot be undone.`)) return;
    await agentsApi.delete(agent.id);
    setAgentsList(list => list.filter(a => a.id !== agent.id));
  };

  const handleAddSave = async () => {
    if (!addForm.name || !addForm.role) return;
    setAddSaving(true);
    try {
      const { agent } = await agentsApi.create(addForm);
      setAgentsList(list => [...list, agent]);
      setShowAdd(false);
      setAddForm({ name: '', role: '', department: '', background: '', personality: '', hobby: '', avatarUrl: AVATAR_URLS[1] });
    } catch {
      // ignore
    } finally {
      setAddSaving(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteForm.name || !inviteForm.email || !inviteSelectedRole) return;
    setInviteSaving(true);
    setInviteError('');
    setInviteSuccess('');
    try {
      const { resent } = await membersApi.invite({
        name: inviteForm.name.trim(),
        email: inviteForm.email.trim(),
        role: inviteSelectedRole,
        photoUrl: inviteForm.photoUrl.trim() || undefined,
      });
      setInviteSuccess(resent ? 'Invitation resent to your email for testing' : 'Invitation sent to your email for testing');
      setInviteForm({ name: '', email: '', photoUrl: '' });
      setInviteSelectedRole(null);
      loadAll();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to send invite');
    } finally {
      setInviteSaving(false);
    }
  };

  const handleRemoveMember = async (member: CompanyMember) => {
    if (!confirm(`Remove ${member.name} from the team?`)) return;
    setRemovingId(member.id);
    try {
      await membersApi.remove(member.id);
      setMembersList(list => list.filter(m => m.id !== member.id));
    } finally {
      setRemovingId(null);
    }
  };

  if (loading) return <div className="text-gray-400 text-sm">Loading…</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-bold text-gray-900 tracking-tight">Team</h2>
        <div className="flex gap-2">
          <button className="btn-secondary flex items-center gap-2 text-sm" onClick={() => setShowInvite(true)}>
            <Mail size={14} /> Invite Person
          </button>
          <button className="btn-primary flex items-center gap-2" onClick={() => setShowAdd(true)}>
            <Plus size={15} /> Add Agent
          </button>
        </div>
      </div>
      <p className="text-sm text-gray-400 mb-8">Manage your team members and AI agents.</p>

      {/* Real People */}
      {(membersList.length > 0 || user) && (
        <div className="mb-8">
          <p className="section-title mb-3">Your Team</p>
          <div className="space-y-2">
            {/* Owner row */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
              <div className="w-8 h-8 rounded-full gradient-bg flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                {user?.name?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{user?.name}</p>
                <p className="text-xs text-gray-400">{user?.email}</p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full gradient-bg text-white flex-shrink-0">
                Owner
              </span>
            </div>
            {membersList.map(member => {
              const roleColor = member.role === 'PARTNER' ? '#d97706' : '#2563eb';
              const roleLabel = member.role === 'PARTNER' ? 'Partner' : 'Employee';
              return (
                <div key={member.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100">
                  {member.photoUrl ? (
                    <img src={member.photoUrl} alt={member.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-sm font-bold flex-shrink-0">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{member.name}</p>
                    <p className="text-xs text-gray-400">{member.email}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {member.status === 'INVITED' ? (
                      <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
                        <Clock size={10} /> Invited
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full">
                        <UserCheck size={10} /> Active
                      </span>
                    )}
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: `${roleColor}15`, color: roleColor }}
                    >
                      {roleLabel}
                    </span>
                    <button
                      onClick={() => handleRemoveMember(member)}
                      disabled={removingId === member.id}
                      className="text-gray-300 hover:text-red-500 transition-colors"
                      title="Remove"
                    >
                      {removingId === member.id ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AI Agents */}
      <div>
        <p className="section-title mb-3">AI Agents</p>
        <div className="grid grid-cols-3 gap-4">
          {agentsList.map(agent => (
            <div key={agent.id} className="card p-4 flex flex-col items-center text-center gap-2">
              <img src={agent.avatarUrl} alt={agent.name} className="w-10 h-10 rounded-full object-cover" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">{agent.name}</p>
                <p className="text-xs text-gray-500">{agent.role}</p>
                <p className="text-xs text-gray-400">{agent.department}</p>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <button
                  className="text-gray-400 hover:text-gray-700 transition-colors"
                  onClick={() => openEdit(agent)}
                  title="Edit"
                >
                  <Pencil size={13} />
                </button>
                <button
                  className="text-gray-400 hover:text-red-500 transition-colors"
                  onClick={() => handleDelete(agent)}
                  title="Delete"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="card p-6 w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-gray-900 text-lg">Invite Person</h3>
              <button onClick={() => { setShowInvite(false); setInviteSuccess(''); setInviteError(''); setInviteSelectedRole(null); setInviteForm({ name: '', email: '', photoUrl: '' }); }} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {/* Role selection */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              {([
                { value: 'PARTNER' as const, icon: '🤝', title: 'Partner', bullets: ['Assign tasks to anyone', 'Schedule and run meetings', 'Chat with all agents', 'Full dashboard access'] },
                { value: 'EMPLOYEE' as const, icon: '👤', title: 'Employee', bullets: ['Work on assigned tasks', 'Chat with agents', 'Attend meetings', 'View-only access'] },
              ]).map(opt => {
                const selected = inviteSelectedRole === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setInviteSelectedRole(opt.value)}
                    className={`text-left rounded-2xl border-2 p-4 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${selected ? 'shadow-sm' : 'border-gray-100 bg-white hover:border-gray-200'}`}
                    style={selected ? {
                      borderColor: 'transparent',
                      backgroundImage: 'linear-gradient(white, white), linear-gradient(to right, #89dba8, #a8d97a)',
                      backgroundOrigin: 'border-box',
                      backgroundClip: 'padding-box, border-box',
                    } : {}}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">{opt.icon}</span>
                      <span className="font-semibold text-gray-900 text-sm">{opt.title}</span>
                    </div>
                    <ul className="space-y-1">
                      {opt.bullets.map(b => (
                        <li key={b} className="flex items-start gap-1.5 text-xs text-gray-500">
                          <span className="text-green-500 font-bold mt-px">✓</span>
                          {b}
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>

            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="label">Full name *</label>
                <input className="input" value={inviteForm.name} onChange={e => setInviteForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Smith" required />
              </div>
              <div>
                <label className="label">Email address *</label>
                <input className="input" type="email" value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@company.com" required />
              </div>
              <div>
                <label className="label">Profile photo URL <span className="text-gray-400 font-normal">(optional)</span></label>
                <input className="input" placeholder="https://…" value={inviteForm.photoUrl} onChange={e => setInviteForm(f => ({ ...f, photoUrl: e.target.value }))} />
              </div>
              {inviteError && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2">{inviteError}</p>}
              {inviteSuccess && <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-2 flex items-center gap-2"><Check size={14} /> {inviteSuccess}</p>}
              <div className="flex gap-3 mt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => { setShowInvite(false); setInviteSuccess(''); setInviteError(''); setInviteSelectedRole(null); setInviteForm({ name: '', email: '', photoUrl: '' }); }}>Cancel</button>
                <button
                  type="submit"
                  disabled={!inviteSelectedRole || !inviteForm.name.trim() || !inviteForm.email.trim() || inviteSaving}
                  className="flex-1 font-semibold text-white py-2.5 rounded-full transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: 'linear-gradient(to right, #89dba8, #a8d97a)' }}
                >
                  {inviteSaving ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Send Invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Agent Modal */}
      {editAgent && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="card p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-gray-900">Edit Agent</h3>
              <button onClick={() => setEditAgent(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="label">Name</label>
                <input className="input" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Role</label>
                <input className="input" value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))} />
              </div>
              <div>
                <label className="label">Department</label>
                <input className="input" value={editForm.department} onChange={e => setEditForm(f => ({ ...f, department: e.target.value }))} />
              </div>
              <div>
                <label className="label">Bio</label>
                <textarea className="input resize-none" rows={2} value={editForm.bio} onChange={e => setEditForm(f => ({ ...f, bio: e.target.value }))} />
              </div>
              <div>
                <label className="label">Personality traits (comma-separated)</label>
                <input className="input" value={editForm.personality} onChange={e => setEditForm(f => ({ ...f, personality: e.target.value }))} placeholder="e.g. analytical, collaborative, creative" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button className="btn-secondary flex-1" onClick={() => setEditAgent(null)}>Cancel</button>
              <button className="btn-primary flex-1" onClick={handleEditSave} disabled={editSaving}>
                {editSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Agent Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-gray-900">Add Agent</h3>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="label">Name *</label>
                <input className="input" value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Smith" />
              </div>
              <div>
                <label className="label">Role *</label>
                <input className="input" value={addForm.role} onChange={e => setAddForm(f => ({ ...f, role: e.target.value }))} placeholder="Head of Marketing" />
              </div>
              <div>
                <label className="label">Department</label>
                <input className="input" value={addForm.department} onChange={e => setAddForm(f => ({ ...f, department: e.target.value }))} placeholder="Marketing" />
              </div>
              <div>
                <label className="label">Background</label>
                <textarea className="input resize-none" rows={2} value={addForm.background} onChange={e => setAddForm(f => ({ ...f, background: e.target.value }))} placeholder="Professional background…" />
              </div>
              <div>
                <label className="label">Personality traits</label>
                <input className="input" value={addForm.personality} onChange={e => setAddForm(f => ({ ...f, personality: e.target.value }))} placeholder="e.g. creative, driven, empathetic" />
              </div>
              <div>
                <label className="label">Hobby</label>
                <input className="input" value={addForm.hobby} onChange={e => setAddForm(f => ({ ...f, hobby: e.target.value }))} placeholder="e.g. Weekend chef" />
              </div>
              <div>
                <label className="label">Avatar</label>
                <div className="grid grid-cols-10 gap-1.5 mt-1">
                  {AVATAR_URLS.map(url => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setAddForm(f => ({ ...f, avatarUrl: url }))}
                      className={`rounded-full overflow-hidden w-8 h-8 border-2 transition-all ${addForm.avatarUrl === url ? 'border-green-500 scale-110' : 'border-transparent'}`}
                    >
                      <img src={url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button className="btn-secondary flex-1" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn-primary flex-1" onClick={handleAddSave} disabled={addSaving || !addForm.name || !addForm.role}>
                {addSaving ? 'Creating…' : 'Create Agent'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Integrations Section ─────────────────────────────────────────────────────
function IntegrationsSection({ jiraMsg, googleMsg }: { jiraMsg?: string | null; googleMsg?: string | null }) {
  const [status, setStatus] = useState<{
    jira: { connected: boolean; workspaceName: string | null };
    google: { connected: boolean; email: string | null };
  } | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<'jira' | 'google' | null>(null);

  useEffect(() => {
    integrationsApi.status()
      .then(s => setStatus(s))
      .catch(() => {})
      .finally(() => setStatusLoading(false));
  }, []);

  const disconnectJira = async () => {
    if (!confirm('Disconnect Jira? Task sync will stop.')) return;
    setDisconnecting('jira');
    try {
      await integrationsApi.jiraDisconnect();
      setStatus(s => s ? { ...s, jira: { connected: false, workspaceName: null } } : s);
    } finally {
      setDisconnecting(null);
    }
  };

  const disconnectGoogle = async () => {
    if (!confirm('Disconnect Google Calendar? Meeting sync will stop.')) return;
    setDisconnecting('google');
    try {
      await integrationsApi.googleDisconnect();
      setStatus(s => s ? { ...s, google: { connected: false, email: null } } : s);
    } finally {
      setDisconnecting(null);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 tracking-tight mb-1">Integrations</h2>
      <p className="text-sm text-gray-400 mb-4">Connect your tools to sync tasks and meetings automatically.</p>

      {(jiraMsg === 'connected' || googleMsg === 'connected') && (
        <div className="mb-4 flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-100 rounded-2xl px-4 py-3">
          <Check size={15} />
          {jiraMsg === 'connected' ? 'Jira connected successfully! Tasks will sync automatically.' : 'Google Calendar connected! Meetings will sync automatically.'}
        </div>
      )}
      {(jiraMsg === 'error' || googleMsg === 'error') && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
          {jiraMsg === 'error' ? 'Failed to connect Jira. Please try again.' : 'Failed to connect Google Calendar. Please try again.'}
        </div>
      )}

      {statusLoading ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {/* Jira */}
          <div className="card p-5 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{ background: '#0052CC' }}>J</div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm">Jira</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {status?.jira.connected ? `Connected · ${status.jira.workspaceName ?? 'Workspace'}` : 'Sync tasks and issues'}
              </p>
              {status?.jira.connected && (
                <div className="flex items-center gap-1 mt-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  <span className="text-xs text-green-600 font-medium">Connected</span>
                </div>
              )}
            </div>
            <div className="flex-shrink-0">
              {status?.jira.connected ? (
                <button
                  onClick={disconnectJira}
                  disabled={disconnecting === 'jira'}
                  className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                >
                  {disconnecting === 'jira' ? <Loader2 size={12} className="animate-spin" /> : 'Disconnect'}
                </button>
              ) : (
                <button
                  onClick={() => integrationsApi.jiraConnect()}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full text-white transition-opacity hover:opacity-90"
                  style={{ background: '#0052CC' }}
                >
                  Connect
                </button>
              )}
            </div>
          </div>

          {/* Google Calendar */}
          <div className="card p-5 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{ background: '#EA4335' }}>G</div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm">Google Calendar</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {status?.google.connected ? `Connected · ${status.google.email ?? ''}` : 'Sync meeting schedules'}
              </p>
              {status?.google.connected && (
                <div className="flex items-center gap-1 mt-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  <span className="text-xs text-green-600 font-medium">Connected</span>
                </div>
              )}
            </div>
            <div className="flex-shrink-0">
              {status?.google.connected ? (
                <button
                  onClick={disconnectGoogle}
                  disabled={disconnecting === 'google'}
                  className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                >
                  {disconnecting === 'google' ? <Loader2 size={12} className="animate-spin" /> : 'Disconnect'}
                </button>
              ) : (
                <button
                  onClick={() => integrationsApi.googleConnect()}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full text-white transition-opacity hover:opacity-90"
                  style={{ background: '#EA4335' }}
                >
                  Connect
                </button>
              )}
            </div>
          </div>

          {/* Slack — coming soon */}
          <div className="card p-5 flex items-start gap-4 opacity-60">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{ background: '#4A154B' }}>S</div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm">Slack</p>
              <p className="text-xs text-gray-400 mt-0.5">Get team notifications</p>
            </div>
            <span className="text-xs bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full font-medium flex-shrink-0">Soon</span>
          </div>

          {/* GitHub — coming soon */}
          <div className="card p-5 flex items-start gap-4 opacity-60">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{ background: '#24292e' }}>G</div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm">GitHub</p>
              <p className="text-xs text-gray-400 mt-0.5">Track code and PRs</p>
            </div>
            <span className="text-xs bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full font-medium flex-shrink-0">Soon</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sounds Section ───────────────────────────────────────────────────────────
function SoundsSection() {
  const [enabled, setEnabled] = useState(() => {
    const stored = localStorage.getItem('teame_sounds_enabled');
    return stored === null ? true : stored === 'true';
  });

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem('teame_sounds_enabled', String(next));
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 tracking-tight mb-1">Sounds</h2>
      <p className="text-sm text-gray-400 mb-8">Manage audio preferences.</p>

      <div className="card p-5 flex items-center justify-between max-w-lg">
        <div>
          <p className="font-medium text-gray-900 text-sm">Sound Effects</p>
          <p className="text-xs text-gray-400 mt-0.5">Play sounds for notifications and events</p>
        </div>
        <button
          onClick={toggle}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${enabled ? 'bg-green-500' : 'bg-gray-200'}`}
          style={enabled ? { background: 'linear-gradient(to right, #89dba8, #a8d97a)' } : {}}
          aria-checked={enabled}
          role="switch"
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${enabled ? 'translate-x-6' : 'translate-x-1'}`}
          />
        </button>
      </div>
    </div>
  );
}

// ── Account Section ──────────────────────────────────────────────────────────
function AccountSection() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'success' | 'error'>('success');

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) {
      setMsg('New passwords do not match');
      setMsgType('error');
      return;
    }
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      if (res.ok) {
        setMsg('Password changed successfully');
        setMsgType('success');
        setCurrentPw(''); setNewPw(''); setConfirmPw('');
      } else {
        const d = await res.json();
        setMsg(d.error || 'Failed to change password');
        setMsgType('error');
      }
    } catch {
      setMsg('Failed to change password');
      setMsgType('error');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = () => {
    logout();
    navigate('/login');
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 tracking-tight mb-1">Account</h2>
      <p className="text-sm text-gray-400 mb-8">Manage your account settings.</p>

      <div className="max-w-lg space-y-6">
        <div className="card p-5">
          <p className="section-title">Your Account</p>
          <p className="text-sm text-gray-700">{user?.name}</p>
          <p className="text-sm text-gray-400 mt-0.5">{user?.email}</p>
        </div>

        <div className="card p-5">
          <p className="section-title">Change Password</p>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="label">Current password</label>
              <input type="password" className="input" value={currentPw} onChange={e => setCurrentPw(e.target.value)} required />
            </div>
            <div>
              <label className="label">New password</label>
              <input type="password" className="input" value={newPw} onChange={e => setNewPw(e.target.value)} required minLength={8} />
            </div>
            <div>
              <label className="label">Confirm new password</label>
              <input type="password" className="input" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required minLength={8} />
            </div>
            {msg && (
              <p className={`text-sm px-4 py-2 rounded-2xl border ${msgType === 'success' ? 'text-green-700 bg-green-50 border-green-100' : 'text-red-600 bg-red-50 border-red-100'}`}>
                {msg}
              </p>
            )}
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Change password'}
            </button>
          </form>
        </div>

        <div className="card p-5">
          <p className="section-title">Danger Zone</p>
          <button
            onClick={handleSignOut}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold px-5 py-2.5 rounded-full transition-all duration-200"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main SettingsPage ────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [searchParams] = useSearchParams();
  const [active, setActive] = useState<Section>(() => {
    const tab = searchParams.get('tab');
    if (tab === 'integrations' || tab === 'team' || tab === 'company' || tab === 'sounds' || tab === 'account') return tab as Section;
    return 'company';
  });
  const jiraMsg = searchParams.get('jira');
  const googleMsg = searchParams.get('google');

  return (
    <div className="flex h-full bg-white">
      <aside className="w-56 border-r border-gray-100 py-6 px-3 flex-shrink-0">
        <p className="section-title px-3">Settings</p>
        <nav className="space-y-0.5">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active === tab.id
                  ? 'bg-green-50 text-green-700 font-semibold'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
              }`}
              style={active === tab.id ? { borderLeft: '3px solid #89dba8', paddingLeft: '9px' } : {}}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto p-8 max-w-3xl">
        {active === 'company' && <CompanySection />}
        {active === 'team' && <TeamSection />}
        {active === 'integrations' && <IntegrationsSection jiraMsg={jiraMsg} googleMsg={googleMsg} />}
        {active === 'sounds' && <SoundsSection />}
        {active === 'account' && <AccountSection />}
      </main>
    </div>
  );
}
