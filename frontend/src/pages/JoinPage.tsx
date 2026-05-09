import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { members as membersApi } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { Loader2, Eye, EyeOff } from 'lucide-react';

type InviteInfo = {
  name: string;
  email: string;
  role: string;
  companyName: string;
};

export default function JoinPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setUser } = useAuth() as { setUser?: (u: { id: string; email: string; name: string }) => void } & ReturnType<typeof useAuth>;
  const token = searchParams.get('token') ?? '';

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (!token) { setError('Invalid or missing invite link.'); setLoading(false); return; }

    membersApi.getInviteInfo(token)
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setInvite({ name: data.name, email: data.email, role: data.role, companyName: data.companyName });
      })
      .catch(() => setError('Failed to load invite. The link may be invalid or expired.'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || password.length < 8) {
      setSubmitError('Password must be at least 8 characters.');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const { token: jwt, user } = await membersApi.acceptInvite(token, password);
      localStorage.setItem('token', jwt);
      if (setUser) setUser(user);
      navigate('/dashboard');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to join. Please try again.');
      setSubmitting(false);
    }
  };

  const roleLabel = invite?.role === 'PARTNER' ? 'Partner' : 'Employee';
  const roleColor = invite?.role === 'PARTNER' ? '#d97706' : '#2563eb';

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 size={32} className="animate-spin" style={{ color: '#89dba8' }} />
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-md w-full text-center">
        <p className="text-4xl mb-4">🔗</p>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Invalid Invite</h2>
        <p className="text-gray-500 text-sm mb-6">{error}</p>
        <a href="/login" className="btn-secondary inline-block text-sm">Go to Login</a>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-md w-full shadow-sm">
        {/* Teame branding */}
        <div className="text-center mb-8">
          <p className="gradient-text text-3xl font-bold tracking-tight mb-1">Teame</p>
          <p className="text-gray-400 text-sm">AI-powered company OS</p>
        </div>

        {/* Invite details */}
        <div className="bg-gray-50 rounded-2xl p-4 mb-6 text-center">
          <p className="text-sm text-gray-500 mb-1">You've been invited to join</p>
          <p className="text-lg font-bold text-gray-900">{invite!.companyName}</p>
          <div className="flex items-center justify-center gap-2 mt-2">
            <span className="text-sm text-gray-500">as</span>
            <span
              className="text-sm font-semibold px-2.5 py-0.5 rounded-full"
              style={{ background: `${roleColor}15`, color: roleColor }}
            >
              {roleLabel}
            </span>
          </div>
        </div>

        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label className="label">Full name</label>
            <input className="input" value={invite!.name} readOnly style={{ opacity: 0.7 }} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" value={invite!.email} readOnly type="email" style={{ opacity: 0.7 }} />
          </div>
          <div>
            <label className="label">Create a password</label>
            <div className="relative">
              <input
                className="input pr-10"
                type={showPw ? 'text' : 'password'}
                placeholder="At least 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPw(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {submitError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2">{submitError}</p>
          )}

          <button
            type="submit"
            disabled={submitting || !password}
            className="w-full btn-primary flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
            {submitting ? 'Joining…' : `Join ${invite!.companyName} →`}
          </button>
        </form>

        <p className="text-xs text-gray-400 text-center mt-4">
          Already have an account?{' '}
          <a href="/login" className="text-green-600 hover:underline">Sign in instead</a>
        </p>
      </div>
    </div>
  );
}
