import { useEffect, useState, useCallback } from 'react';
import { agents as agentsApi, tasks as tasksApi } from '../lib/api';
import type { Task } from '../types';
import {
  Loader2, Pencil, Megaphone, TrendingUp, Search, Target, Code,
  FileText, Globe, Users, Lightbulb, BarChart2, Mail, Wrench,
  Smartphone, Package, Zap, Shield, Star, PenLine,
} from 'lucide-react';

interface Suggestion {
  emoji: string;
  text: string;
  agentId: string;
  agentName: string;
  agentRole?: string;
}

interface SuccessEntry {
  agentName: string;
  agentRole?: string;
}

interface Props {
  onTaskCreated?: (task: Task) => void;
  className?: string;
  agentId?: string;
}

const ICON_COLOR = '#3db87a';
const ICON_SIZE = 13;

function SuggestionIcon({ emoji }: { emoji: string }) {
  const map: Record<string, React.ReactNode> = {
    '🎨': <Pencil size={ICON_SIZE} color={ICON_COLOR} />,
    '✍️': <PenLine size={ICON_SIZE} color={ICON_COLOR} />,
    '🖊️': <PenLine size={ICON_SIZE} color={ICON_COLOR} />,
    '📝': <FileText size={ICON_SIZE} color={ICON_COLOR} />,
    '📣': <Megaphone size={ICON_SIZE} color={ICON_COLOR} />,
    '📢': <Megaphone size={ICON_SIZE} color={ICON_COLOR} />,
    '📈': <TrendingUp size={ICON_SIZE} color={ICON_COLOR} />,
    '📊': <BarChart2 size={ICON_SIZE} color={ICON_COLOR} />,
    '🔍': <Search size={ICON_SIZE} color={ICON_COLOR} />,
    '🔎': <Search size={ICON_SIZE} color={ICON_COLOR} />,
    '🎯': <Target size={ICON_SIZE} color={ICON_COLOR} />,
    '💻': <Code size={ICON_SIZE} color={ICON_COLOR} />,
    '⌨️': <Code size={ICON_SIZE} color={ICON_COLOR} />,
    '📱': <Smartphone size={ICON_SIZE} color={ICON_COLOR} />,
    '🌐': <Globe size={ICON_SIZE} color={ICON_COLOR} />,
    '👥': <Users size={ICON_SIZE} color={ICON_COLOR} />,
    '🤝': <Users size={ICON_SIZE} color={ICON_COLOR} />,
    '💡': <Lightbulb size={ICON_SIZE} color={ICON_COLOR} />,
    '📧': <Mail size={ICON_SIZE} color={ICON_COLOR} />,
    '📨': <Mail size={ICON_SIZE} color={ICON_COLOR} />,
    '🔧': <Wrench size={ICON_SIZE} color={ICON_COLOR} />,
    '🛠️': <Wrench size={ICON_SIZE} color={ICON_COLOR} />,
    '📦': <Package size={ICON_SIZE} color={ICON_COLOR} />,
    '🚀': <Zap size={ICON_SIZE} color={ICON_COLOR} />,
    '⚡': <Zap size={ICON_SIZE} color={ICON_COLOR} />,
    '💰': <BarChart2 size={ICON_SIZE} color={ICON_COLOR} />,
    '💵': <BarChart2 size={ICON_SIZE} color={ICON_COLOR} />,
    '🔒': <Shield size={ICON_SIZE} color={ICON_COLOR} />,
    '🛡️': <Shield size={ICON_SIZE} color={ICON_COLOR} />,
    '🏗️': <Package size={ICON_SIZE} color={ICON_COLOR} />,
    '🗂️': <FileText size={ICON_SIZE} color={ICON_COLOR} />,
    '📋': <FileText size={ICON_SIZE} color={ICON_COLOR} />,
  };
  return <>{map[emoji] || <Star size={ICON_SIZE} color={ICON_COLOR} />}</>;
}

export default function TaskSuggestions({ onTaskCreated, className = '', agentId }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [successMap, setSuccessMap] = useState<Map<string, SuccessEntry>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { suggestions: s } = agentId
        ? await agentsApi.agentTaskSuggestions(agentId)
        : await agentsApi.suggestions();
      setSuggestions(s);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => { load(); }, [load]);

  const handleClick = async (s: Suggestion) => {
    const key = s.emoji + s.text;
    if (creating || dismissed.has(key)) return;

    setCreating(key);
    try {
      const { task } = await tasksApi.create({
        title: `${s.emoji} ${s.text}`,
        description: `Task suggested by AI for ${s.agentName}: ${s.text}. Complete based on the company's current priorities.`,
        assignedAgentId: s.agentId,
        priority: 'MEDIUM',
        autoExecute: true,
      });

      setDismissed(prev => new Set([...prev, key]));
      setSuccessMap(prev => new Map(prev).set(key, { agentName: s.agentName, agentRole: s.agentRole }));
      onTaskCreated?.(task);

      setTimeout(() => {
        setSuccessMap(prev => {
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
        load();
      }, 3000);
    } catch {
      // silently ignore
    } finally {
      setCreating(null);
    }
  };

  const visible = suggestions.filter(s => !dismissed.has(s.emoji + s.text));
  const hasContent = visible.length > 0 || successMap.size > 0;

  if (loading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Loader2 size={13} className="animate-spin text-gray-400" />
        <span className="text-xs text-gray-400">Loading suggestions…</span>
      </div>
    );
  }

  if (!hasContent) return null;

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        {/* Success pills */}
        {Array.from(successMap.entries()).map(([key, { agentName, agentRole }]) => (
          <div
            key={`success-${key}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-green-700 bg-green-50 border border-green-200"
          >
            <span className="text-green-500">✓</span>
            <span>
              Created for {agentName}{agentRole ? ` — ${agentRole}` : ''}
            </span>
          </div>
        ))}

        {/* Suggestion chips */}
        {visible.slice(0, agentId ? 4 : 5).map(s => {
          const key = s.emoji + s.text;
          const isCreating = creating === key;
          return (
            <button
              key={key}
              onClick={() => handleClick(s)}
              disabled={!!creating}
              title={`Assign to ${s.agentName}${s.agentRole ? ` (${s.agentRole})` : ''}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
              style={{
                background: 'linear-gradient(white, white) padding-box, linear-gradient(to right, #89dba8, #a8d97a) border-box',
                border: '1.5px solid transparent',
                color: '#374151',
              }}
            >
              {isCreating ? (
                <Loader2 size={12} className="animate-spin text-[#3db87a]" />
              ) : (
                <SuggestionIcon emoji={s.emoji} />
              )}
              <span>{s.text}</span>
              {!isCreating && (
                <span className="ml-0.5 text-[#89dba8] font-bold text-base leading-none">+</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
