import { useDroppable } from '@dnd-kit/core';
import type { ReactNode } from 'react';

interface KanbanColumnProps {
  id: string;
  title: string;
  color: string;
  count: number;
  children: ReactNode;
}

export default function KanbanColumn({
  id,
  title,
  color,
  count,
  children,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  const colorClasses: Record<string, string> = {
    gray: 'border-gray-600',
    amber: 'border-amber-500',
    green: 'border-green-500',
  };

  const dotColors: Record<string, string> = {
    gray: 'bg-gray-500',
    amber: 'bg-amber-500',
    green: 'bg-green-500',
  };

  return (
    <div className="flex-shrink-0 w-80">
      <div
        className={`bg-gray-900 rounded-xl border-t-2 ${colorClasses[color]} h-full flex flex-col`}
      >
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${dotColors[color]}`} />
              <h3 className="font-semibold text-white">{title}</h3>
            </div>
            <span className="text-sm text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
              {count}
            </span>
          </div>
        </div>

        <div
          ref={setNodeRef}
          className={`flex-1 p-3 space-y-3 overflow-y-auto min-h-[200px] transition-colors ${
            isOver ? 'bg-blue-500/5' : ''
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
