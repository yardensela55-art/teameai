import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { company as companyApi } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import type { OrgChartAgent, CompanyMode } from '../types';

// ─── AgentPreviewCard ────────────────────────────────────────────────────────

interface AgentPreviewCardProps {
  agent: OrgChartAgent;
  onEdit: (updated: OrgChartAgent) => void;
}

function AgentPreviewCard({ agent, onEdit }: AgentPreviewCardProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(agent.name);
  const [editRole, setEditRole] = useState(agent.role);

  const firstTrait = agent.personality
    ? agent.personality.split(',')[0].trim()
    : '';

  const save = () => {
    onEdit({ ...agent, name: editName, role: editRole });
    setEditing(false);
  };

  return (
    <div
      className="bg-white rounded-2xl border border-gray-100 p-4 cursor-pointer hover:shadow-md transition-all relative"
      onClick={() => !editing && setEditing(true)}
    >
      {editing ? (
        <div className="space-y-2" onClick={e => e.stopPropagation()}>
          <input
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#89dba8]"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            placeholder="Name"
          />
          <input
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#89dba8]"
            value={editRole}
            onChange={e => setEditRole(e.target.value)}
            placeholder="Role"
          />
          <div className="flex gap-2 mt-1">
            <button
              onClick={save}
              style={{ background: 'linear-gradient(to right, #89dba8, #a8d97a)' }}
              className="text-white text-xs font-semibold px-3 py-1 rounded-full hover:opacity-90 transition-all"
            >
              Save
            </button>
            <button
              onClick={() => { setEditName(agent.name); setEditRole(agent.role); setEditing(false); }}
              className="text-gray-400 text-xs font-semibold px-3 py-1 rounded-full hover:bg-gray-100 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <img src={agent.avatarUrl} alt={agent.name} className="w-14 h-14 rounded-full object-cover flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 text-sm truncate">{agent.name}</p>
            <p className="text-green-600 text-xs mt-0.5 truncate">{agent.role}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {agent.age ? `Age ${agent.age} · ` : ''}{agent.department}
            </p>
            {agent.hobby && (
              <p className="text-xs text-gray-400 italic mt-1 truncate">{agent.hobby}</p>
            )}
            {firstTrait && (
              <span className="inline-block mt-2 text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
                {firstTrait}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ModeCard ────────────────────────────────────────────────────────────────

function ModeCard({
  icon, title, description, bullets, selected, onClick,
}: {
  icon: string;
  title: string;
  description: string;
  bullets: string[];
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 text-left rounded-2xl border-2 p-8 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl ${
        selected
          ? 'shadow-lg'
          : 'border-gray-100 bg-white hover:border-gray-200'
      }`}
      style={selected ? {
        borderColor: 'transparent',
        backgroundImage: 'linear-gradient(white, white), linear-gradient(to right, #89dba8, #a8d97a)',
        backgroundOrigin: 'border-box',
        backgroundClip: 'padding-box, border-box',
      } : {}}
    >
      <span className="text-5xl mb-5 block">{icon}</span>
      <h3 className="text-xl font-bold text-gray-900 mb-3">{title}</h3>
      <p className="text-gray-500 text-sm leading-relaxed mb-5">{description}</p>
      <ul className="space-y-2">
        {bullets.map(b => (
          <li key={b} className="flex items-center gap-2 text-sm text-gray-700">
            <span className="text-green-500 font-bold">✓</span>
            {b}
          </li>
        ))}
      </ul>
    </button>
  );
}

// ─── Main OnboardingPage ──────────────────────────────────────────────────────

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Steps: 0=Welcome, 1=MgmtStyle, 2=CompanyDetails, 3=BuildingTeam, 4=MeetTeam, 5=Ready
  const [step, setStep] = useState(0);

  // Step 1 state
  const [companyMode, setCompanyMode] = useState<CompanyMode | null>(null);

  // Step 2 form state
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [description, setDescription] = useState('');
  const [vision, setVision] = useState('');

  // Step 3 state
  const [currentMessageIdx, setCurrentMessageIdx] = useState(0);
  const [buildError, setBuildError] = useState('');

  // Step 4 state
  const [agents, setAgents] = useState<OrgChartAgent[]>([]);
  const [regenerating, setRegenerating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  const loadingMessages = [
    'Hiring your CTO...',
    'Finding the perfect designer...',
    'Onboarding your marketing lead...',
    'Setting up your finance team...',
    'Almost there...',
  ];

  // Step 3: trigger API + message cycling
  useEffect(() => {
    if (step !== 3) return;

    setBuildError('');
    setCurrentMessageIdx(0);

    const interval = setInterval(() => {
      setCurrentMessageIdx(prev =>
        prev < loadingMessages.length - 1 ? prev + 1 : prev
      );
    }, 2000);

    companyApi
      .generateOrgChart(companyName, industry, description, vision)
      .then(({ agents: generated }) => {
        clearInterval(interval);
        setAgents(generated);
        setStep(4);
      })
      .catch(err => {
        clearInterval(interval);
        setBuildError(err instanceof Error ? err.message : 'Failed to generate team');
      });

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Step 5: confetti + auto-redirect
  useEffect(() => {
    if (step !== 5) return;

    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.6 },
      colors: ['#89dba8', '#a8d97a', '#ffffff', '#34d399'],
    });

    const timer = setTimeout(() => navigate('/dashboard'), 3000);
    return () => clearTimeout(timer);
  }, [step, navigate]);

  const step2Valid =
    companyName.trim() !== '' &&
    industry.trim() !== '' &&
    description.trim() !== '' &&
    vision.trim() !== '';

  const updateAgent = (index: number, updated: OrgChartAgent) => {
    setAgents(prev => prev.map((a, i) => (i === index ? updated : a)));
  };

  const regenerate = async () => {
    setRegenerating(true);
    setConfirmError('');
    try {
      const { agents: generated } = await companyApi.generateOrgChart(
        companyName, industry, description, vision
      );
      setAgents(generated);
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : 'Failed to regenerate');
    } finally {
      setRegenerating(false);
    }
  };

  const confirmTeam = async () => {
    setConfirming(true);
    setConfirmError('');
    try {
      await companyApi.setup(companyName, industry, description, vision, agents, companyMode ?? 'CEO');
      setStep(5);
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : 'Failed to save company');
    } finally {
      setConfirming(false);
    }
  };

  // ── Step 0: Welcome ────────────────────────────────────────────────────────
  if (step === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white flex items-center justify-center p-6">
        <div className="max-w-lg w-full text-center">
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight mb-4">
            Welcome to Teame, {user?.name?.split(' ')[0]} 👋
          </h1>
          <p className="text-lg text-gray-500 mb-10 leading-relaxed">
            You're about to build your company with a full AI-powered team.<br />
            No hiring. No salaries. Just results.
          </p>

          <div className="space-y-4 mb-10 text-left max-w-sm mx-auto">
            {[
              { icon: '🧠', text: 'A team of AI agents built for your business' },
              { icon: '📋', text: 'Manage tasks, meetings and strategy — all in one place' },
              { icon: '🚀', text: 'From idea to execution, faster than ever' },
            ].map(({ icon, text }) => (
              <div key={text} className="flex items-center gap-4">
                <span className="text-2xl">{icon}</span>
                <span className="text-gray-700 font-medium">{text}</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => setStep(1)}
            style={{ background: 'linear-gradient(to right, #89dba8, #a8d97a)' }}
            className="text-white font-semibold px-8 py-4 rounded-full text-lg shadow-lg hover:opacity-90 active:scale-95 transition-all duration-200"
          >
            Let's Build Your Company →
          </button>
        </div>
      </div>
    );
  }

  // ── Step 1: Management Style ───────────────────────────────────────────────
  if (step === 1) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white flex items-center justify-center p-6">
        <div className="max-w-3xl w-full">
          <div className="text-center mb-10">
            <span className="text-xs text-gray-400">Step 1 of 5</span>
            <h2 className="text-3xl font-bold text-gray-900 tracking-tight mt-2">
              How do you want to run your company?
            </h2>
            <p className="text-gray-400 mt-2">You can always change this later in Settings</p>
          </div>

          <div className="flex gap-6">
            <ModeCard
              icon="👔"
              title="CEO Mode"
              description="You're in full control. Assign tasks, schedule meetings, chat with every team member directly, and manage the company yourself."
              bullets={[
                'Direct access to all agents',
                'Full task & meeting control',
                'You decide everything',
              ]}
              selected={companyMode === 'CEO'}
              onClick={() => setCompanyMode('CEO')}
            />
            <ModeCard
              icon="🧘"
              title="Founder Mode"
              description="You have a Chief of Staff who runs the company for you. He briefs you daily, manages the team, and you only make the big calls."
              bullets={[
                'Chief of Staff handles everything',
                'You get daily briefings',
                'Focus on vision, not operations',
              ]}
              selected={companyMode === 'FOUNDER'}
              onClick={() => setCompanyMode('FOUNDER')}
            />
          </div>

          <div className="flex justify-between items-center mt-10">
            <button
              onClick={() => setStep(0)}
              className="text-gray-400 font-medium px-5 py-2 rounded-full hover:bg-gray-100 transition-all"
            >
              ← Back
            </button>
            <button
              onClick={() => setStep(2)}
              disabled={!companyMode}
              style={companyMode ? { background: 'linear-gradient(to right, #89dba8, #a8d97a)' } : {}}
              className={`font-semibold px-8 py-3 rounded-full transition-all duration-200 ${
                companyMode
                  ? 'text-white hover:opacity-90 active:scale-95 shadow-md'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: Company Details ────────────────────────────────────────────────
  if (step === 2) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white rounded-3xl shadow-lg border border-gray-100 p-10">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
                Tell us about your company
              </h2>
              <p className="text-gray-400 mt-1">
                This helps us build the perfect team for you
              </p>
            </div>
            <span className="text-xs text-gray-400 mt-1 whitespace-nowrap">Step 2 of 5</span>
          </div>

          <div className="space-y-4">
            <input
              className="w-full border border-gray-100 rounded-2xl px-4 py-3 text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#89dba8] bg-white"
              placeholder="Company Name"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
            />

            <select
              className="w-full border border-gray-100 rounded-2xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#89dba8] bg-white appearance-none"
              value={industry}
              onChange={e => setIndustry(e.target.value)}
            >
              <option value="" disabled>Industry</option>
              {['Tech', 'Finance', 'Health', 'E-commerce', 'Education', 'Marketing', 'Legal', 'Other'].map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>

            <textarea
              rows={4}
              className="w-full border border-gray-100 rounded-2xl px-4 py-3 text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#89dba8] bg-white resize-none"
              placeholder="We build an app that helps people..."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />

            <textarea
              rows={3}
              className="w-full border border-gray-100 rounded-2xl px-4 py-3 text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#89dba8] bg-white resize-none"
              placeholder="In 5 years we want to..."
              value={vision}
              onChange={e => setVision(e.target.value)}
            />
          </div>

          <div className="flex justify-between items-center mt-8">
            <button
              onClick={() => setStep(1)}
              className="text-gray-400 font-medium px-5 py-2 rounded-full hover:bg-gray-100 transition-all"
            >
              ← Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!step2Valid}
              style={step2Valid ? { background: 'linear-gradient(to right, #89dba8, #a8d97a)' } : {}}
              className={`text-white font-semibold px-6 py-3 rounded-full transition-all duration-200 ${
                step2Valid
                  ? 'hover:opacity-90 active:scale-95 shadow-md'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 3: Building Your Team ─────────────────────────────────────────────
  if (step === 3) {
    if (buildError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white flex items-center justify-center p-6">
          <div className="text-center max-w-md w-full">
            <div className="text-5xl mb-6">⚠️</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Something went wrong</h2>
            <p className="text-gray-500 mb-8">{buildError}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setStep(2)}
                className="text-gray-400 font-medium px-5 py-2 rounded-full hover:bg-gray-100 transition-all"
              >
                ← Back
              </button>
              <button
                onClick={() => { setBuildError(''); setStep(3); }}
                style={{ background: 'linear-gradient(to right, #89dba8, #a8d97a)' }}
                className="text-white font-semibold px-6 py-3 rounded-full hover:opacity-90 transition-all shadow-md"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white flex items-center justify-center p-6">
        <div className="text-center max-w-md w-full">
          <div
            className="w-24 h-24 rounded-full mx-auto mb-8 animate-pulse"
            style={{ background: 'linear-gradient(to right, #89dba8, #a8d97a)' }}
          />
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight mb-4">
            Building your dream team...
          </h2>
          <p className="text-gray-500 text-lg transition-all duration-500">
            {loadingMessages[currentMessageIdx]}
          </p>
        </div>
      </div>
    );
  }

  // ── Step 4: Meet Your Team ─────────────────────────────────────────────────
  if (step === 4) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white flex items-center justify-center p-6">
        <div className="max-w-4xl w-full">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Meet your team 🎉</h2>
            <p className="text-gray-500 mt-2">
              These are the people who will help you build your company
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-8">
            {agents.map((agent, i) => (
              <AgentPreviewCard
                key={i}
                agent={agent}
                onEdit={updated => updateAgent(i, updated)}
              />
            ))}
          </div>

          {confirmError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4 text-center">
              {confirmError}
            </p>
          )}

          <div className="flex gap-4 justify-center">
            <button
              onClick={regenerate}
              disabled={regenerating}
              className="font-semibold px-6 py-3 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 transition-all disabled:opacity-50"
            >
              {regenerating ? 'Regenerating...' : '↺ Regenerate Team'}
            </button>
            <button
              onClick={confirmTeam}
              disabled={confirming || regenerating}
              style={{ background: 'linear-gradient(to right, #89dba8, #a8d97a)' }}
              className="text-white font-semibold px-8 py-3 rounded-full hover:opacity-90 active:scale-95 transition-all duration-200 shadow-md disabled:opacity-50"
            >
              {confirming ? 'Setting up...' : 'Confirm & Enter →'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 5: You're Ready! ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white flex items-center justify-center p-6">
      <div className="text-center max-w-md w-full">
        <div className="text-7xl mb-6">🚀</div>
        <h2 className="text-4xl font-bold text-gray-900 tracking-tight mb-4">
          Your company is live!
        </h2>
        <p className="text-gray-500 text-lg mb-10">
          {companyName} is ready. Your team is waiting for you.
        </p>
        <button
          onClick={() => navigate('/dashboard')}
          style={{ background: 'linear-gradient(to right, #89dba8, #a8d97a)' }}
          className="text-white font-semibold px-10 py-4 rounded-full text-lg shadow-lg hover:opacity-90 active:scale-95 transition-all duration-200"
        >
          Enter {companyName} →
        </button>
        <p className="text-xs text-gray-300 mt-4">Redirecting automatically in 3 seconds...</p>
      </div>
    </div>
  );
}
