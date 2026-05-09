import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { agents as agentsApi, members as membersApi } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import type { Agent, CompanyMember } from '../types';
import { Loader2, UserCircle } from 'lucide-react';
import { isChiefOfStaff, COS_GLOW } from '../lib/chiefOfStaff';

// ── Human badge ──────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: 'OWNER' | 'PARTNER' | 'EMPLOYEE' }) {
  const styles = {
    OWNER: 'bg-green-100 text-green-700',
    PARTNER: 'bg-amber-100 text-amber-700',
    EMPLOYEE: 'bg-blue-100 text-blue-700',
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${styles[role]}`}>
      {role.charAt(0) + role.slice(1).toLowerCase()}
    </span>
  );
}

// ── Person card (Owner / Partner / Employee) ──────────────────────────────────

function PersonCard({ name, email, photoUrl, role }: {
  name: string; email: string; photoUrl?: string | null; role: 'OWNER' | 'PARTNER' | 'EMPLOYEE';
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col gap-3">
      <div className="flex items-start gap-3">
        {photoUrl ? (
          <img src={photoUrl} alt={name} className="w-16 h-16 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 text-2xl font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #89dba8, #a8d97a)' }}>
            {name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="font-semibold text-gray-900 leading-tight">{name}</p>
          <p className="text-gray-500 text-xs mt-0.5 truncate">{email}</p>
          <div className="flex items-center gap-2 mt-2">
            <RoleBadge role={role} />
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">Human</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main OrgChartPage ─────────────────────────────────────────────────────────

export default function OrgChartPage() {
  const { user } = useAuth();
  const [agentList, setAgentList] = useState<Agent[]>([]);
  const [memberList, setMemberList] = useState<CompanyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([agentsApi.list(), membersApi.list()])
      .then(([{ agents }, { members }]) => {
        setAgentList(agents);
        setMemberList(members);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 size={24} className="animate-spin text-green-500" />
    </div>
  );

  if (error) return <div className="p-8 text-red-600">{error}</div>;

  const departments = agentList.reduce((acc, agent) => {
    const dept = agent.department || 'General';
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(agent);
    return acc;
  }, {} as Record<string, Agent[]>);

  const hasHumans = user || memberList.length > 0;

  return (
    <div className="p-8 bg-white min-h-full">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Org Chart</h1>
        <p className="text-gray-500 mt-1 text-sm">
          {(memberList.length + 1)} human{memberList.length + 1 !== 1 ? 's' : ''} · {agentList.length} AI team members across {Object.keys(departments).length} departments
        </p>
      </div>

      <div className="space-y-10">
        {/* ── People section (Owner + invited members) ── */}
        {hasHumans && (
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="h-px flex-1 bg-gray-200" />
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-3 flex items-center gap-2">
                <UserCircle size={13} /> People
              </h2>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {/* Owner card */}
              {user && (
                <PersonCard
                  name={user.name}
                  email={user.email}
                  role="OWNER"
                />
              )}
              {/* Partner / Employee cards */}
              {memberList.map(m => (
                <PersonCard
                  key={m.id}
                  name={m.name}
                  email={m.email}
                  photoUrl={m.photoUrl}
                  role={m.role}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── AI Agents by department ── */}
        {Object.entries(departments).map(([dept, deptAgents]) => (
          <div key={dept}>
            <div className="flex items-center gap-3 mb-5">
              <div className="h-px flex-1 bg-gray-200" />
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-3">{dept}</h2>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {deptAgents.map(agent => {
                const cos = isChiefOfStaff(agent);
                return (
                <Link
                  key={agent.id}
                  to={`/agents/${agent.id}`}
                  className="block bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-gray-300 transition-all group"
                  style={cos ? {
                    transform: 'scale(1.04)',
                    borderColor: 'transparent',
                    backgroundImage: 'linear-gradient(white, white), linear-gradient(to right, #89dba8, #a8d97a)',
                    backgroundOrigin: 'border-box',
                    backgroundClip: 'padding-box, border-box',
                  } : {}}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <img
                      src={agent.avatarUrl}
                      alt={agent.name}
                      className="w-16 h-16 rounded-full object-cover flex-shrink-0"
                      style={cos ? { boxShadow: COS_GLOW } : {}}
                    />
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className={`font-semibold leading-tight ${cos ? 'gradient-text' : 'text-gray-900'}`}>
                        {cos ? `✦ ${agent.name}` : agent.name}
                      </p>
                      <p className="text-green-600 text-sm mt-0.5">{agent.role}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="inline-block bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full">
                          {agent.department}
                        </span>
                        <span className="inline-block bg-purple-50 text-purple-600 text-xs px-2 py-0.5 rounded-full font-medium">
                          AI
                        </span>
                      </div>
                    </div>
                  </div>

                  {agent.age && (
                    <p className="text-gray-400 text-xs mb-1">Age {agent.age}</p>
                  )}
                  {agent.hobby && (
                    <p className="text-gray-500 text-xs italic mb-3">{agent.hobby}</p>
                  )}

                  <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-100">
                    <span className="text-green-600 text-xs group-hover:underline">Chat →</span>
                  </div>
                </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
