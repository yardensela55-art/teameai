import type { Priority } from '../../types';
import clsx from 'clsx';

const styles: Record<Priority, string> = {
  LOW: 'bg-gray-100 text-gray-600',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  HIGH: 'bg-red-100 text-red-700',
};

export default function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={clsx('badge', styles[priority])}>
      {priority}
    </span>
  );
}
