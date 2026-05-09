import type { TaskStatus, MeetingStatus } from '../../types';
import clsx from 'clsx';

const taskStyles: Record<TaskStatus, string> = {
  BACKLOG: 'bg-gray-100 text-gray-600',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  REVIEW: 'bg-purple-100 text-purple-700',
  DONE: 'bg-green-100 text-green-700',
};

const taskLabels: Record<TaskStatus, string> = {
  BACKLOG: 'Backlog',
  IN_PROGRESS: 'In Progress',
  REVIEW: 'Review',
  DONE: 'Done',
};

const meetingStyles: Record<MeetingStatus, string> = {
  SCHEDULED: 'bg-yellow-100 text-yellow-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={clsx('badge', taskStyles[status])}>
      {taskLabels[status]}
    </span>
  );
}

export function MeetingStatusBadge({ status }: { status: MeetingStatus }) {
  return (
    <span className={clsx('badge', meetingStyles[status])}>
      {status.charAt(0) + status.slice(1).toLowerCase().replace('_', ' ')}
    </span>
  );
}
