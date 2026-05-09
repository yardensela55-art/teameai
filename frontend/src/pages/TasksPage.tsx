import { useEffect, useState, useCallback } from 'react';
import { tasks as tasksApi, agents as agentsApi, members as membersApi } from '../lib/api';
import type { Task, Agent, TaskStatus, CompanyMember } from '../types';
import { TaskStatusBadge } from '../components/ui/StatusBadge';
import PriorityBadge from '../components/ui/PriorityBadge';
import { Plus, Loader2, Sparkles, X, ChevronDown, RefreshCw } from 'lucide-react';
import TaskSuggestions from '../components/TaskSuggestions';

const COLUMNS: TaskStatus[] = ['BACKLOG', 'IN_PROGRESS', 'REVIEW', 'DONE'];
const COLUMN_LABELS: Record<TaskStatus, string> = {
  BACKLOG: 'Backlog',
  IN_PROGRESS: 'In Progress',
  REVIEW: 'Review',
  DONE: 'Done',
};

function AssigneeAvatar({ task }: { task: Task }) {
  if (task.assignedAgent) {
    return (
      <div className="flex items-center gap-1.5 mt-2">
        <img src={task.assignedAgent.avatarUrl} alt={task.assignedAgent.name}
          className="w-5 h-5 rounded-full object-cover" />
        <span className="text-xs text-gray-500">{task.assignedAgent.name}</span>
      </div>
    );
  }
  if (task.assignedMember) {
    return (
      <div className="flex items-center gap-1.5 mt-2">
        {task.assignedMember.photoUrl ? (
          <img src={task.assignedMember.photoUrl} alt={task.assignedMember.name}
            className="w-5 h-5 rounded-full object-cover" />
        ) : (
          <div className="w-5 h-5 rounded-full gradient-bg flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {task.assignedMember.name.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="text-xs text-gray-500">{task.assignedMember.name}</span>
        <span className="text-xs bg-blue-50 text-blue-600 px-1 py-0.5 rounded font-medium">Human</span>
      </div>
    );
  }
  return null;
}

// Tasks currently being generated (agent assigned, no output, IN_PROGRESS)
function isGenerating(task: Task): boolean {
  return !!(task.assignedAgent && !task.aiOutput && task.status === 'IN_PROGRESS');
}

export default function TasksPage() {
  const [taskList, setTaskList] = useState<Task[]>([]);
  const [agentList, setAgentList] = useState<Agent[]>([]);
  const [memberList, setMemberList] = useState<CompanyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Notification for completed tasks
  const [completedNotification, setCompletedNotification] = useState<{ name: string; title: string } | null>(null);

  const [newAssignee, setNewAssignee] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPriority, setNewPriority] = useState('MEDIUM');
  const [creating, setCreating] = useState(false);

  const loadTasks = useCallback(async () => {
    const { tasks } = await tasksApi.list();
    return tasks;
  }, []);

  useEffect(() => {
    Promise.all([tasksApi.list(), agentsApi.list(), membersApi.list()])
      .then(([{ tasks }, { agents }, { members }]) => {
        setTaskList(tasks);
        setAgentList(agents);
        setMemberList(members.filter(m => m.status === 'ACTIVE'));
      })
      .finally(() => setLoading(false));
  }, []);

  // Poll for task completion — only when there are generating tasks
  useEffect(() => {
    const generatingTasks = taskList.filter(isGenerating);
    if (generatingTasks.length === 0) return;

    const pollInterval = setInterval(async () => {
      try {
        const freshTasks = await loadTasks();
        const prev = taskList;

        // Detect newly completed tasks
        for (const fresh of freshTasks) {
          const old = prev.find(t => t.id === fresh.id);
          if (old && isGenerating(old) && fresh.aiOutput && fresh.assignedAgent) {
            setCompletedNotification({ name: fresh.assignedAgent.name, title: fresh.title });
            setTimeout(() => setCompletedNotification(null), 5000);
          }
        }

        setTaskList(freshTasks);
        // Update selectedTask if it was modified
        if (selectedTask) {
          const updated = freshTasks.find(t => t.id === selectedTask.id);
          if (updated) setSelectedTask(updated);
        }
      } catch { /* ignore */ }
    }, 4000);

    return () => clearInterval(pollInterval);
  }, [taskList, selectedTask, loadTasks]);

  const parseAssignee = (value: string) => {
    if (!value) return { assignedAgentId: undefined, assignedMemberId: undefined };
    if (value.startsWith('agent:')) return { assignedAgentId: value.slice(6), assignedMemberId: undefined };
    if (value.startsWith('member:')) return { assignedMemberId: value.slice(7), assignedAgentId: undefined };
    return {};
  };

  const createTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const { task } = await tasksApi.create({
        title: newTitle,
        description: newDesc,
        priority: newPriority,
        autoExecute: true,
        ...parseAssignee(newAssignee),
      });
      setTaskList(prev => [task, ...prev]);
      setNewTitle(''); setNewDesc(''); setNewAssignee(''); setNewPriority('MEDIUM');
      setShowCreate(false);
    } finally {
      setCreating(false);
    }
  };

  const generateOutput = async (task: Task) => {
    setGenerating(task.id);
    try {
      const { task: updated } = await tasksApi.generate(task.id);
      setTaskList(prev => prev.map(t => t.id === updated.id ? updated : t));
      setSelectedTask(updated);
    } finally {
      setGenerating(null);
    }
  };

  const moveTask = async (task: Task, status: TaskStatus) => {
    const { task: updated } = await tasksApi.update(task.id, { status });
    setTaskList(prev => prev.map(t => t.id === updated.id ? updated : t));
    if (selectedTask?.id === updated.id) setSelectedTask(updated);
  };

  const deleteTask = async (id: string) => {
    await tasksApi.delete(id);
    setTaskList(prev => prev.filter(t => t.id !== id));
    if (selectedTask?.id === id) setSelectedTask(null);
  };

  const refreshTasks = async () => {
    setRefreshing(true);
    try {
      const tasks = await loadTasks();
      setTaskList(tasks);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 size={24} className="animate-spin text-green-500" />
    </div>
  );

  const tasksByStatus = COLUMNS.reduce((acc, col) => {
    acc[col] = taskList.filter(t => t.status === col);
    return acc;
  }, {} as Record<TaskStatus, Task[]>);

  const assignedTo = selectedTask?.assignedAgent
    ? { name: selectedTask.assignedAgent.name, role: selectedTask.assignedAgent.role, avatarUrl: selectedTask.assignedAgent.avatarUrl, isHuman: false }
    : selectedTask?.assignedMember
      ? { name: selectedTask.assignedMember.name, role: selectedTask.assignedMember.role, avatarUrl: selectedTask.assignedMember.photoUrl, isHuman: true }
      : null;

  return (
    <div className="flex h-full bg-white">
      {/* Completed task notification */}
      {completedNotification && (
        <div
          className="fixed top-5 right-5 z-50 bg-white border border-green-200 rounded-2xl px-4 py-3 shadow-lg flex items-center gap-3 max-w-sm"
          style={{ animation: 'fadeInUp 0.3s ease-out' }}
        >
          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #89dba8, #a8d97a)' }}>
            <Sparkles size={14} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-900">{completedNotification.name} completed:</p>
            <p className="text-xs text-gray-600 truncate">{completedNotification.title}</p>
          </div>
          <button onClick={() => setCompletedNotification(null)} className="text-gray-300 hover:text-gray-500 flex-shrink-0">
            <X size={13} />
          </button>
        </div>
      )}

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto p-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshTasks}
              disabled={refreshing}
              className="p-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
              title="Refresh tasks"
            >
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button className="btn-primary flex items-center gap-2" onClick={() => setShowCreate(true)}>
              <Plus size={16} /> New task
            </button>
          </div>
        </div>

        {/* Suggestion chips */}
        <TaskSuggestions
          className="mb-6"
          onTaskCreated={task => setTaskList(prev => [task, ...prev])}
        />

        <div className="flex gap-4 min-w-max">
          {COLUMNS.map(col => (
            <div key={col} className="w-72 flex-shrink-0">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-semibold text-gray-700">{COLUMN_LABELS[col]}</span>
                <span className="bg-white border border-gray-200 text-gray-500 text-xs rounded-full px-1.5 py-0.5">
                  {tasksByStatus[col].length}
                </span>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 space-y-2 min-h-[120px]">
                {tasksByStatus[col].map(task => {
                  const thinking = isGenerating(task);
                  return (
                    <div
                      key={task.id}
                      className={`bg-white border rounded-lg p-3 shadow-sm hover:shadow-md cursor-pointer transition-all ${
                        thinking ? 'border-green-200 shadow-green-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setSelectedTask(task)}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-sm font-medium text-gray-900 leading-snug">{task.title}</p>
                        <PriorityBadge priority={task.priority} />
                      </div>
                      <AssigneeAvatar task={task} />
                      {thinking && (
                        <div className="flex items-center gap-1.5 mt-2">
                          <Loader2 size={11} className="animate-spin text-[#3db87a]" />
                          <span className="text-xs text-[#3db87a] font-medium">Generating…</span>
                        </div>
                      )}
                      {task.aiOutput && !thinking && (
                        <div className="mt-2">
                          <span className="badge bg-green-50 text-green-600">AI output ready</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Task detail panel */}
      {selectedTask && (
        <div className="w-96 flex-shrink-0 border-l border-gray-200 flex flex-col overflow-y-auto bg-white">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900 truncate mr-4">{selectedTask.title}</h2>
            <button className="text-gray-400 hover:text-gray-600" onClick={() => setSelectedTask(null)}>
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 p-5 space-y-5">
            <div className="flex items-center gap-2">
              <TaskStatusBadge status={selectedTask.status} />
              <PriorityBadge priority={selectedTask.priority} />
            </div>

            <div>
              <p className="label">Description</p>
              <p className="text-sm text-gray-600">{selectedTask.description}</p>
            </div>

            {assignedTo && (
              <div>
                <p className="label">Assigned to</p>
                <div className="flex items-center gap-2">
                  {assignedTo.avatarUrl ? (
                    <img src={assignedTo.avatarUrl} alt={assignedTo.name} className="w-6 h-6 rounded-full object-cover" />
                  ) : (
                    <div className="w-6 h-6 rounded-full gradient-bg flex items-center justify-center text-white text-xs font-bold">
                      {assignedTo.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm text-gray-900">{assignedTo.name}</span>
                  {assignedTo.isHuman && (
                    <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium">Human</span>
                  )}
                </div>
              </div>
            )}

            <div>
              <p className="label">Move to</p>
              <div className="flex flex-wrap gap-2">
                {COLUMNS.filter(c => c !== selectedTask.status).map(col => (
                  <button key={col} className="btn-secondary text-xs py-1 px-2" onClick={() => moveTask(selectedTask, col)}>
                    {COLUMN_LABELS[col]}
                  </button>
                ))}
              </div>
            </div>

            {selectedTask.assignedAgent && !selectedTask.aiOutput && (
              <button
                className="btn-primary w-full flex items-center justify-center gap-2"
                onClick={() => generateOutput(selectedTask)}
                disabled={generating === selectedTask.id || isGenerating(selectedTask)}
              >
                {generating === selectedTask.id || isGenerating(selectedTask)
                  ? <><Loader2 size={15} className="animate-spin" /> Generating…</>
                  : <><Sparkles size={15} /> Generate AI output</>}
              </button>
            )}

            {selectedTask.assignedMember && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                <p className="text-xs text-blue-700 font-medium">Human task</p>
                <p className="text-xs text-blue-600 mt-0.5">
                  {selectedTask.assignedMember.name} will see this task when they log in.
                </p>
              </div>
            )}

            {selectedTask.aiOutput && (
              <div>
                <p className="label flex items-center gap-1.5"><Sparkles size={12} /> AI Output</p>
                <div className="bg-gray-50 rounded-lg p-3 text-gray-700 text-sm whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed">
                  {selectedTask.aiOutput}
                </div>
              </div>
            )}

            <button className="text-xs text-red-500 hover:text-red-600 transition-colors" onClick={() => deleteTask(selectedTask.id)}>
              Delete task
            </button>
          </div>
        </div>
      )}

      {/* Create task modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md border border-gray-200">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-gray-900">New task</h2>
              <button className="text-gray-400 hover:text-gray-600" onClick={() => setShowCreate(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={createTask} className="space-y-4">
              <div>
                <label className="label">Title</label>
                <input className="input" placeholder="Task title" value={newTitle}
                  onChange={e => setNewTitle(e.target.value)} required />
              </div>
              <div>
                <label className="label">Description</label>
                <textarea className="input min-h-[80px] resize-none" placeholder="What needs to be done?"
                  value={newDesc} onChange={e => setNewDesc(e.target.value)} required />
              </div>
              <div>
                <label className="label">Assign to</label>
                <div className="relative">
                  <select className="input appearance-none pr-8" value={newAssignee} onChange={e => setNewAssignee(e.target.value)}>
                    <option value="">Unassigned</option>
                    {memberList.length > 0 && (
                      <optgroup label="── People ──">
                        {memberList.map(m => (
                          <option key={m.id} value={`member:${m.id}`}>
                            {m.name} — {m.role === 'PARTNER' ? 'Partner' : 'Employee'}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="── AI Team ──">
                      {agentList.map(a => (
                        <option key={a.id} value={`agent:${a.id}`}>{a.name} — {a.role}</option>
                      ))}
                    </optgroup>
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="label">Priority</label>
                <div className="relative">
                  <select className="input appearance-none pr-8" value={newPriority} onChange={e => setNewPriority(e.target.value)}>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <Sparkles size={10} className="text-[#89dba8]" />
                When assigned to an AI agent, output is generated automatically
              </p>
              <div className="flex gap-3 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn-primary flex-1" disabled={creating}>
                  {creating ? 'Creating…' : 'Create task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
