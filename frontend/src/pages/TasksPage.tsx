import { useState, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  rectIntersection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type CollisionDetection,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { tasksApi } from '../services/api';
import type { Task } from '../types';
import KanbanColumn from '../components/KanbanColumn';
import TaskCard from '../components/TaskCard';
import TaskModal from '../components/TaskModal';
import CreateTaskModal from '../components/CreateTaskModal';
import { Plus } from 'lucide-react';

const COLUMNS = [
  { id: 'todo', title: 'To Do', color: 'gray' },
  { id: 'in_progress', title: 'In Progress', color: 'amber' },
  { id: 'done', title: 'Done', color: 'green' },
] as const;

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      setIsLoading(true);
      const data = await tasksApi.getAll();
      setTasks(data);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = tasks.find((t) => t.id === active.id);
    setActiveTask(task || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const taskId = active.id as number;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    // Determine target column
    let targetColumn: string;
    if (COLUMNS.some((col) => col.id === over.id)) {
      targetColumn = over.id as string;
    } else {
      const overTask = tasks.find((t) => t.id === over.id);
      if (!overTask) return;
      targetColumn = overTask.status;
    }

    // Calculate new position
    const tasksInColumn = tasks.filter((t) => t.status === targetColumn);
    let newPosition = 0;

    if (over.id !== targetColumn) {
      const overIndex = tasksInColumn.findIndex((t) => t.id === over.id);
      newPosition = overIndex >= 0 ? overIndex : tasksInColumn.length;
    } else {
      newPosition = tasksInColumn.length;
    }

    // Optimistic update
    const updatedTasks = tasks.map((t) =>
      t.id === taskId
        ? { ...t, status: targetColumn as Task['status'], position: newPosition }
        : t
    );
    setTasks(updatedTasks);

    // API call
    try {
      await tasksApi.move(taskId, targetColumn, newPosition);
      // Reload to get correct positions
      loadTasks();
    } catch (error) {
      console.error('Failed to move task:', error);
      loadTasks();
    }
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
  };

  const handleTaskUpdate = async () => {
    await loadTasks();
    if (selectedTask) {
      const updated = await tasksApi.get(selectedTask.id);
      setSelectedTask(updated);
    }
  };

  const handleTaskCreated = () => {
    setIsCreateModalOpen(false);
    loadTasks();
  };

  const getTasksByStatus = (status: string) =>
    tasks.filter((t) => t.status === status).sort((a, b) => a.position - b.position);

  // Custom collision detection that prioritizes columns over tasks
  const collisionDetection: CollisionDetection = (args) => {
    // First check if we're over a droppable column
    const pointerCollisions = pointerWithin(args);
    const columnCollision = pointerCollisions.find((collision) =>
      COLUMNS.some((col) => col.id === collision.id)
    );

    if (columnCollision) {
      // If over a column, also check for task collisions within that column
      const taskCollisions = rectIntersection(args).filter(
        (collision) => !COLUMNS.some((col) => col.id === collision.id)
      );

      if (taskCollisions.length > 0) {
        return taskCollisions;
      }
      return [columnCollision];
    }

    // Fall back to closest center for tasks
    return closestCenter(args);
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <div className="text-gray-400">Loading tasks...</div>
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Tasks</h1>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Plus size={18} />
          New Task
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((column) => {
            const columnTasks = getTasksByStatus(column.id);
            return (
              <KanbanColumn
                key={column.id}
                id={column.id}
                title={column.title}
                color={column.color}
                count={columnTasks.length}
              >
                <SortableContext
                  items={columnTasks.map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {columnTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onClick={() => handleTaskClick(task)}
                    />
                  ))}
                </SortableContext>
              </KanbanColumn>
            );
          })}
        </div>

        <DragOverlay>
          {activeTask && <TaskCard task={activeTask} isDragging />}
        </DragOverlay>
      </DndContext>

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleTaskUpdate}
        />
      )}

      {isCreateModalOpen && (
        <CreateTaskModal
          onClose={() => setIsCreateModalOpen(false)}
          onCreated={handleTaskCreated}
        />
      )}
    </div>
  );
}
