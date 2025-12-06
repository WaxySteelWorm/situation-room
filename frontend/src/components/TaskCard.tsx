import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task } from '../types';
import { Calendar, MessageSquare, RefreshCw, User } from 'lucide-react';

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
  isDragging?: boolean;
}

const priorityColors: Record<string, string> = {
  low: 'border-l-gray-500',
  medium: 'border-l-blue-500',
  high: 'border-l-amber-500',
  urgent: 'border-l-red-500',
};

const priorityBadges: Record<string, string> = {
  low: 'bg-gray-700 text-gray-300',
  medium: 'bg-blue-500/20 text-blue-400',
  high: 'bg-amber-500/20 text-amber-400',
  urgent: 'bg-red-500/20 text-red-400',
};

export default function TaskCard({ task, onClick, isDragging }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isOverdue =
    task.due_date &&
    new Date(task.due_date) < new Date() &&
    task.status !== 'done';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`bg-gray-800 rounded-lg border-l-4 ${priorityColors[task.priority]}
        p-3 cursor-pointer hover:bg-gray-750 transition-colors
        ${isDragging || isSortableDragging ? 'opacity-50 shadow-lg' : ''}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-medium text-white line-clamp-2">
          {task.title}
        </h4>
        {task.is_recurring && (
          <RefreshCw size={14} className="text-purple-400 flex-shrink-0" />
        )}
      </div>

      {task.description && (
        <p className="text-xs text-gray-500 line-clamp-2 mb-2">
          {task.description}
        </p>
      )}

      {task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.labels.map((label) => (
            <span
              key={label.id}
              className="text-xs px-1.5 py-0.5 rounded"
              style={{ backgroundColor: `${label.color}30`, color: label.color }}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-3 text-gray-500">
          {task.due_date && (
            <span
              className={`flex items-center gap-1 ${
                isOverdue ? 'text-red-400' : ''
              }`}
            >
              <Calendar size={12} />
              {new Date(task.due_date).toLocaleDateString()}
            </span>
          )}
          {task.comments.length > 0 && (
            <span className="flex items-center gap-1">
              <MessageSquare size={12} />
              {task.comments.length}
            </span>
          )}
        </div>

        {task.assignee && (
          <span className="flex items-center gap-1 text-gray-400">
            <User size={12} />
            {task.assignee}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span
          className={`text-xs px-1.5 py-0.5 rounded ${
            priorityBadges[task.priority]
          }`}
        >
          {task.priority}
        </span>
      </div>
    </div>
  );
}
