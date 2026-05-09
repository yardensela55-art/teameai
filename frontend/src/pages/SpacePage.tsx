import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { agents as agentsApi, members as membersApi } from '../lib/api';
import { isChiefOfStaff, COS_GLOW } from '../lib/chiefOfStaff';
import type { Agent, CompanyMember } from '../types';
import { Loader2, Bot, Users2 } from 'lucide-react';
import { useDarkMode } from '../context/DarkModeContext';

export default function SpacePage() {
  const navigate = useNavigate();
  const { isDark } = useDarkMode();
  const [agentsList, setAgentsList] = useState<Agent[]>([]);
  const [membersList, setMembersList] = useState<CompanyMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([agentsApi.list(), membersApi.list()])
      .then(([{ agents: a }, { members: m }]) => {
        setAgentsList(a);
        setMembersList(m.filter(mem => mem.status === 'ACTIVE'));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 size={28} className="animate-spin" style={{ color: '#89dba8' }} />
    </div>
  );

  const cardBase = `flex flex-col items-center gap-3 p-5 rounded-2xl border text-center transition-all ${
    isDark ? 'border-[#2A2A2A] bg-[#1A1A1A]' : 'border-gray-100 bg-white'
  }`;

  return (
    <div className={`p-8 min-h-full ${isDark ? 'bg-[#0F0F0F]' : 'bg-white'}`}>
      <div className="max-w-5xl mx-auto">
        <h1 className={`text-2xl font-bold tracking-tight mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>Space</h1>
        <p className={`text-sm mb-10 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          Your team's workspace — click any AI agent to explore their hub.
        </p>

        {agentsList.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-5">
              <Bot size={13} className={isDark ? 'text-gray-600' : 'text-gray-400'} />
              <span className={`text-xs font-semibold uppercase tracking-widest ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                AI Team
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {agentsList.map(agent => {
                const cos = isChiefOfStaff(agent);
                return (
                  <button
                    key={agent.id}
                    onClick={() => navigate(`/space/${agent.id}`)}
                    className={`${cardBase} hover:-translate-y-0.5 hover:shadow-md`}
                  >
                    <div className="relative">
                      <img
                        src={agent.avatarUrl}
                        alt={agent.name}
                        className="w-14 h-14 rounded-full object-cover"
                        style={cos ? { boxShadow: COS_GLOW } : {}}
                      />
                      <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 ${isDark ? 'border-[#1A1A1A]' : 'border-white'}`} />
                    </div>
                    <div>
                      <p className={`text-sm font-semibold leading-tight ${cos ? 'gradient-text' : isDark ? 'text-white' : 'text-gray-900'}`}>
                        {cos ? `✦ ${agent.name}` : agent.name}
                      </p>
                      <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{agent.role}</p>
                      {agent.department && (
                        <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-600' : 'text-gray-300'}`}>{agent.department}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {membersList.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-5">
              <Users2 size={13} className={isDark ? 'text-gray-600' : 'text-gray-400'} />
              <span className={`text-xs font-semibold uppercase tracking-widest ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                People
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {membersList.map(member => {
                const roleColor = member.role === 'PARTNER' ? '#d97706' : '#2563eb';
                const roleLabel = member.role === 'PARTNER' ? 'Partner' : 'Employee';
                return (
                  <div key={member.id} className={cardBase}>
                    {member.photoUrl ? (
                      <img src={member.photoUrl} alt={member.name} className="w-14 h-14 rounded-full object-cover" />
                    ) : (
                      <div className="w-14 h-14 rounded-full gradient-bg flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{member.name}</p>
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full mt-1.5 inline-block"
                        style={{ background: `${roleColor}18`, color: roleColor }}
                      >
                        {roleLabel}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {agentsList.length === 0 && membersList.length === 0 && (
          <div className="text-center py-24">
            <p className={`text-sm ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>No team members yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
