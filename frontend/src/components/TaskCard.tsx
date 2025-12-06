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
  low: 'border-l-gray-500 shadow-[inset_2px_0_5px_rgba(107,114,128,0.3)]',
  medium: 'border-l-neon-blue shadow-[inset_2px_0_5px_rgba(0,243,255,0.3)]',
  high: 'border-l-neon-purple shadow-[inset_2px_0_5px_rgba(157,0,255,0.3)]',
  urgent: 'border-l-neon-pink shadow-[inset_2px_0_5px_rgba(255,0,255,0.3)]',
};

const priorityBadges: Record<string, string> = {
  low: 'bg-gray-800 text-gray-400 border border-gray-700',
  medium: 'bg-neon-blue/10 text-neon-blue border border-neon-blue/30',
  high: 'bg-neon-purple/10 text-neon-purple border border-neon-purple/30',
  urgent: 'bg-neon-pink/10 text-neon-pink border border-neon-pink/30',
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
      className={`bg-cyber-gray/90 backdrop-blur-sm rounded-lg border-l-4 ${priorityColors[task.priority]}
        p-3 cursor-pointer hover:bg-cyber-slate transition-all duration-300 border-y border-r border-white/5 hover:border-white/10 hover:shadow-glass
        ${isDragging || isSortableDragging ? 'opacity-50 shadow-[0_0_20px_rgba(0,243,255,0.3)] border-neon-blue' : ''}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-medium text-gray-100 line-clamp-2 group-hover:text-white transition-colors">
          {task.title}
        </h4>
        {task.is_recurring && (
          <RefreshCw size={14} className="text-neon-purple flex-shrink-0 drop-shadow-[0_0_5px_rgba(157,0,255,0.5)]" />
        )}
      </div>

      {task.description && (
        <p className="text-xs text-gray-400 line-clamp-2 mb-2">
          {task.description}
        </p>
      )}

      {task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.labels.map((label) => (
            <span
              key={label.id}
              className="text-xs px-1.5 py-0.5 rounded border border-white/10"
              style={{ backgroundColor: `${label.color}20`, color: label.color, borderColor: `${label.color}40` }}
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
              className={`flex items-center gap-1 ${isOverdue ? 'text-neon-pink drop-shadow-[0_0_5px_rgba(255,0,255,0.5)]' : 'text-gray-400'
                }`}
            >
              <Calendar size={12} />
              {new Date(task.due_date).toLocaleDateString()}
            </span>
          )}
          {task.comments.length > 0 && (
            <span className="flex items-center gap-1 text-neon-blue/70">
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
          className={`text-xs px-1.5 py-0.5 rounded ${priorityBadges[task.priority]
            }`}
        >
          {task.priority}
        </span>
      </div>
    </div>
  );
}
