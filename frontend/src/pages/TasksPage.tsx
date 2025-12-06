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
import { tasksApi, columnsApi, type Column } from '../services/api';
import type { Task } from '../types';
import KanbanColumn from '../components/KanbanColumn';
import TaskCard from '../components/TaskCard';
import TaskModal from '../components/TaskModal';
import CreateTaskModal from '../components/CreateTaskModal';
import { Plus, Settings, X, Trash2, ChevronUp, ChevronDown } from 'lucide-react';

const COLUMN_COLORS = [
  { name: 'Gray', value: 'gray' },
  { name: 'Red', value: 'red' },
  { name: 'Orange', value: 'orange' },
  { name: 'Amber', value: 'amber' },
  { name: 'Yellow', value: 'yellow' },
  { name: 'Green', value: 'green' },
  { name: 'Blue', value: 'blue' },
  { name: 'Purple', value: 'purple' },
  { name: 'Pink', value: 'pink' },
];

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isColumnSettingsOpen, setIsColumnSettingsOpen] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnColor, setNewColumnColor] = useState('gray');

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
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [tasksData, columnsData] = await Promise.all([
        tasksApi.getAll(),
        columnsApi.getAll(),
      ]);
      setTasks(tasksData);
      setColumns(columnsData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTasks = async () => {
    try {
      const data = await tasksApi.getAll();
      setTasks(data);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    }
  };

  const loadColumns = async () => {
    try {
      const data = await columnsApi.getAll();
      setColumns(data);
    } catch (error) {
      console.error('Failed to load columns:', error);
    }
  };

  const handleAddColumn = async () => {
    if (!newColumnName.trim()) return;
    try {
      await columnsApi.create({
        name: newColumnName.trim(),
        color: newColumnColor,
      });
      setNewColumnName('');
      setNewColumnColor('gray');
      loadColumns();
    } catch (error) {
      console.error('Failed to create column:', error);
    }
  };

  const handleDeleteColumn = async (columnId: number) => {
    if (!confirm('Delete this column? Tasks in this column will remain but may need to be moved.')) return;
    try {
      await columnsApi.delete(columnId);
      loadColumns();
    } catch (error) {
      console.error('Failed to delete column:', error);
    }
  };

  const handleUpdateColumnColor = async (columnId: number, color: string) => {
    try {
      await columnsApi.update(columnId, { color });
      loadColumns();
    } catch (error) {
      console.error('Failed to update column:', error);
    }
  };

  const handleMoveColumn = async (columnId: number, direction: 'up' | 'down') => {
    const currentIndex = columns.findIndex((c) => c.id === columnId);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= columns.length) return;

    // Create new order
    const newOrder = [...columns];
    const [moved] = newOrder.splice(currentIndex, 1);
    newOrder.splice(newIndex, 0, moved);

    // Optimistic update
    setColumns(newOrder);

    try {
      await columnsApi.reorder(newOrder.map((c) => c.id));
      loadColumns();
    } catch (error) {
      console.error('Failed to reorder columns:', error);
      loadColumns();
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
    if (columns.some((col) => col.slug === over.id)) {
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
      columns.some((col) => col.slug === collision.id)
    );

    if (columnCollision) {
      // If over a column, also check for task collisions within that column
      const taskCollisions = rectIntersection(args).filter(
        (collision) => !columns.some((col) => col.slug === collision.id)
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsColumnSettingsOpen(true)}
            className="flex items-center gap-2 px-3 py-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            title="Column Settings"
          >
            <Settings size={18} />
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <Plus size={18} />
            New Task
          </button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 flex gap-4 overflow-x-auto pb-4">
          {columns.map((column) => {
            const columnTasks = getTasksByStatus(column.slug);
            return (
              <KanbanColumn
                key={column.id}
                id={column.slug}
                title={column.name}
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

      {/* Column Settings Modal */}
      {isColumnSettingsOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl w-full max-w-md border border-gray-800">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Column Settings</h2>
              <button
                onClick={() => setIsColumnSettingsOpen(false)}
                className="p-1 text-gray-400 hover:text-white rounded"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Existing columns */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-400">Columns</h3>
                {columns.map((column, index) => (
                  <div
                    key={column.id}
                    className="flex items-center gap-2 p-2 bg-gray-800 rounded-lg"
                  >
                    <div className="flex flex-col">
                      <button
                        onClick={() => handleMoveColumn(column.id, 'up')}
                        disabled={index === 0}
                        className="p-0.5 text-gray-400 hover:text-white disabled:text-gray-600 disabled:cursor-not-allowed"
                        title="Move up"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        onClick={() => handleMoveColumn(column.id, 'down')}
                        disabled={index === columns.length - 1}
                        className="p-0.5 text-gray-400 hover:text-white disabled:text-gray-600 disabled:cursor-not-allowed"
                        title="Move down"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>
                    <span className="flex-1 text-white">{column.name}</span>
                    <select
                      value={column.color}
                      onChange={(e) => handleUpdateColumnColor(column.id, e.target.value)}
                      className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white"
                    >
                      {COLUMN_COLORS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    {columns.length > 1 && (
                      <button
                        onClick={() => handleDeleteColumn(column.id)}
                        className="p-1 text-gray-400 hover:text-red-400 rounded"
                        title="Delete column"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Add new column */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-400">Add Column</h3>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newColumnName}
                    onChange={(e) => setNewColumnName(e.target.value)}
                    placeholder="Column name"
                    className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddColumn()}
                  />
                  <select
                    value={newColumnColor}
                    onChange={(e) => setNewColumnColor(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-white"
                  >
                    {COLUMN_COLORS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleAddColumn}
                    disabled={!newColumnName.trim()}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded-lg transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
