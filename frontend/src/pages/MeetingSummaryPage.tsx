import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { meetings as meetingsApi, tasks as tasksApi } from '../lib/api';
import type { Meeting, MeetingSummary, MeetingSummaryActionItem } from '../types';
import {
  Loader2, CheckSquare, Square, Lightbulb, ListChecks,
  ArrowRight, CalendarDays, Clock, Users, Sparkles, ChevronRight,
} from 'lucide-react';

function Shimmer({ className }: { className?: string }) {
  return <div className={`bg-gray-100 rounded-xl animate-pulse ${className ?? ''}`} />;
}

function SectionCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #89dba8, #a8d97a)' }}>
          {icon}
        </div>
        <h2 className="font-semibold text-gray-900">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function ActionItemRow({
  item, onCreateTask,
}: {
  item: MeetingSummaryActionItem & { taskCreated?: boolean };
  onCreateTask: (item: MeetingSummaryActionItem) => void;
}) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl transition-all ${item.taskCreated ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
      <div className="flex-shrink-0 mt-0.5">
        {item.taskCreated
          ? <CheckSquare size={18} className="text-green-500" />
          : <Square size={18} className="text-gray-300" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${item.taskCreated ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
          {item.what}
        </p>
        <div className="flex items-center gap-3 mt-1.5">
          {item.agentAvatar && (
            <div className="flex items-center gap-1.5">
              <img src={item.agentAvatar} alt={item.who} className="w-5 h-5 rounded-full object-cover" />
              <span className="text-xs text-gray-500">{item.who}</span>
            </div>
          )}
          {!item.agentAvatar && item.who && (
            <span className="text-xs text-gray-500">{item.who}</span>
          )}
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{item.timeline}</span>
        </div>
      </div>
      {!item.taskCreated && (
        <button
          onClick={() => onCreateTask(item)}
          className="flex-shrink-0 text-xs text-[#3db87a] hover:text-green-700 font-medium flex items-center gap-1 transition-colors"
        >
          + Task <ChevronRight size={12} />
        </button>
      )}
      {item.taskCreated && (
        <span className="flex-shrink-0 text-xs text-green-500 font-medium">Added ✓</span>
      )}
    </div>
  );
}

export default function MeetingSummaryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [summary, setSummary] = useState<MeetingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [taskCreatedFor, setTaskCreatedFor] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!id) return;
    meetingsApi.get(id)
      .then(({ meeting: m }) => {
        setMeeting(m);
        if (m.summary) {
          setSummary(m.summary as unknown as MeetingSummary);
          setLoading(false);
        } else {
          setLoading(false);
          setGenerating(true);
          meetingsApi.summarize(id)
            .then(({ summary: s }) => setSummary(s))
            .catch(() => setError('Failed to generate summary. The transcript may be empty.'))
            .finally(() => setGenerating(false));
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Meeting not found.');
        setLoading(false);
      });
  }, [id]);

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

  const createAllTasks = async () => {
    if (!summary?.actionItems) return;
    for (const item of summary.actionItems) {
      if (!taskCreatedFor.has(item.what)) {
        await createTask(item);
      }
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-[#3db87a]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center">
        <p className="text-red-500 mb-4">{error}</p>
        <Link to="/meeting-room" className="btn-secondary inline-flex">← Back to Calendar</Link>
      </div>
    );
  }

  if (generating || !summary) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <Shimmer className="h-8 w-64" />
          <Shimmer className="h-6 w-32" />
        </div>
        <div className="space-y-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-6">
              <Shimmer className="h-5 w-40 mb-4" />
              <div className="space-y-2">
                <Shimmer className="h-4 w-full" />
                <Shimmer className="h-4 w-4/5" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-center gap-3 mt-8 text-gray-500">
          <Loader2 size={18} className="animate-spin text-[#3db87a]" />
          <span className="text-sm font-medium">
            {meeting ? `Generating summary for "${meeting.title}"…` : 'Generating summary…'}
          </span>
        </div>
      </div>
    );
  }

  // ── Derived data ─────────────────────────────────────────────────────────────

  const attendees = meeting?.slots?.map(s => s.agent) ?? [];
  const leads = attendees.slice(0, 2);

  const scheduledAt = meeting ? new Date(meeting.scheduledAt) : null;
  const dateStr = scheduledAt
    ? scheduledAt.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const timeStr = scheduledAt
    ? scheduledAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : '';

  const hasActionItems = summary.actionItems && summary.actionItems.length > 0;
  const allTasksCreated = hasActionItems && summary.actionItems.every(i => taskCreatedFor.has(i.what));

  return (
    <div className="p-8 max-w-3xl mx-auto pb-20">
      {/* ── Header Card ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <div
                className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold text-white"
                style={{ background: 'linear-gradient(to right, #89dba8, #a8d97a)' }}
              >
                <Sparkles size={11} /> Summary
              </div>
            </div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight mb-4">
              {meeting?.title}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
              {dateStr && (
                <span className="flex items-center gap-1.5">
                  <CalendarDays size={14} className="text-gray-400" />
                  {dateStr}
                </span>
              )}
              {timeStr && (
                <span className="flex items-center gap-1.5">
                  <Clock size={14} className="text-gray-400" />
                  {timeStr}
                </span>
              )}
              {attendees.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <Users size={14} className="text-gray-400" />
                  {attendees.length} attendees
                </span>
              )}
            </div>
          </div>

          {/* Leads */}
          {leads.length > 0 && (
            <div className="flex-shrink-0">
              <p className="text-xs text-gray-400 font-medium mb-2 text-right">Presenters</p>
              <div className="flex flex-col gap-2">
                {leads.map(agent => (
                  <div key={agent.id} className="flex items-center gap-2 justify-end">
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-800 leading-tight">{agent.name}</p>
                      <p className="text-xs text-gray-400">{agent.role}</p>
                    </div>
                    <img src={agent.avatarUrl} alt={agent.name} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── All Attendees ───────────────────────────────────────────────────── */}
      {attendees.length > 0 && (
        <SectionCard icon={<Users size={17} className="text-white" />} title="Attendees">
          <div className="flex flex-wrap gap-3">
            {attendees.map(agent => (
              <div key={agent.id} className="flex items-center gap-2 bg-gray-50 rounded-full px-3 py-1.5">
                <img src={agent.avatarUrl} alt={agent.name} className="w-6 h-6 rounded-full object-cover" />
                <span className="text-sm text-gray-700 font-medium">{agent.name}</span>
                <span className="text-xs text-gray-400">{agent.role}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <div className="space-y-4 mt-4">
        {/* Key Points */}
        {summary.keyPoints.length > 0 && (
          <SectionCard icon={<Lightbulb size={17} className="text-white" />} title="Key Points">
            <div className="space-y-5">
              {summary.keyPoints.map((kp, i) => (
                <div key={i}>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">{kp.topic}</h3>
                  <ul className="space-y-1.5">
                    {kp.points.map((point, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm text-gray-600">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#89dba8] flex-shrink-0 mt-2" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Action Items — only if any exist */}
        {hasActionItems && (
          <SectionCard icon={<ListChecks size={17} className="text-white" />} title="Action Items">
            <p className="text-xs text-gray-400 mb-3">Click "+ Task" to add to your Tasks board</p>
            <div className="space-y-1">
              {summary.actionItems.map((item, i) => (
                <ActionItemRow
                  key={i}
                  item={{ ...item, taskCreated: taskCreatedFor.has(item.what) }}
                  onCreateTask={createTask}
                />
              ))}
            </div>
          </SectionCard>
        )}

        {/* Next Steps */}
        {summary.nextSteps.length > 0 && (
          <SectionCard icon={<ArrowRight size={17} className="text-white" />} title="Next Steps">
            <ul className="space-y-2">
              {summary.nextSteps.map((step, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                  <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 flex-shrink-0 mt-0.5">
                    {i + 1}
                  </div>
                  {step}
                </li>
              ))}
            </ul>
          </SectionCard>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mt-8">
        <Link to="/meeting-room" className="btn-secondary flex items-center gap-2">
          <CalendarDays size={16} /> Back to Calendar
        </Link>
        {hasActionItems && !allTasksCreated && (
          <button
            onClick={createAllTasks}
            className="btn-primary flex items-center gap-2"
          >
            <ListChecks size={16} /> Create All Tasks
          </button>
        )}
        {hasActionItems && allTasksCreated && (
          <span className="text-sm text-green-600 font-medium flex items-center gap-1.5">
            <CheckSquare size={15} /> All tasks created
          </span>
        )}
        <button
          onClick={() => navigate('/dashboard')}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors ml-auto"
        >
          Go to Dashboard →
        </button>
      </div>
    </div>
  );
}
