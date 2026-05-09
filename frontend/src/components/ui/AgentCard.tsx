import { Link } from 'react-router-dom';
import type { Agent } from '../../types';

interface Props {
  agent: Agent;
  onClick?: () => void;
  compact?: boolean;
}

export default function AgentCard({ agent, onClick, compact }: Props) {
  const card = (
    <div
      className={`card p-4 hover:border-gray-300 transition-colors cursor-pointer ${compact ? 'flex items-center gap-3' : ''}`}
      onClick={onClick}
    >
      <img
        src={agent.avatarUrl}
        alt={agent.name}
        className={`rounded-full bg-gray-100 flex-shrink-0 ${compact ? 'w-10 h-10' : 'w-14 h-14 mb-3'}`}
      />
      <div>
        <p className={`font-semibold text-gray-900 ${compact ? 'text-sm' : ''}`}>{agent.name}</p>
        <p className={`text-green-600 ${compact ? 'text-xs' : 'text-sm'}`}>{agent.role}</p>
        {!compact && (
          <p className="text-xs text-gray-500 mt-0.5">{agent.department}</p>
        )}
      </div>
      {!compact && agent.personality && (
        <p className="text-xs text-gray-500 mt-2 line-clamp-2">{agent.personality}</p>
      )}
    </div>
  );

  if (onClick) return card;

  return <Link to={`/agents/${agent.id}`}>{card}</Link>;
}
