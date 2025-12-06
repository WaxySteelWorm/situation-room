import { useState } from 'react';
import { tasksApi } from '../services/api';
import type { Task } from '../types';
import {
  X,
  Calendar,
  User,
  Tag,
  MessageSquare,
  Archive,
  RefreshCw,
  Send,
} from 'lucide-react';

interface TaskModalProps {
  task: Task;
  onClose: () => void;
  onUpdate: () => void;
}

const priorityOptions = ['low', 'medium', 'high', 'urgent'];
const statusOptions = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

export default function TaskModal({ task, onClose, onUpdate }: TaskModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [status, setStatus] = useState(task.status);
  const [priority, setPriority] = useState(task.priority);
  const [assignee, setAssignee] = useState(task.assignee || '');
  const [dueDate, setDueDate] = useState(
    task.due_date ? task.due_date.split('T')[0] : ''
  );
  const [newComment, setNewComment] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await tasksApi.update(task.id, {
        title,
        description: description || undefined,
        status,
        priority,
        assignee: assignee || undefined,
        due_date: dueDate ? new Date(dueDate).toISOString() : undefined,
      });
      setIsEditing(false);
      onUpdate();
    } catch (error) {
      console.error('Failed to update task:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!confirm('Archive this task?')) return;
    try {
      await tasksApi.archive(task.id);
      onClose();
      onUpdate();
    } catch (error) {
      console.error('Failed to archive task:', error);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    try {
      await tasksApi.addComment(task.id, newComment);
      setNewComment('');
      onUpdate();
    } catch (error) {
      console.error('Failed to add comment:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl border border-gray-800 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {task.is_recurring && (
              <RefreshCw size={16} className="text-purple-400" />
            )}
            <span className="text-sm text-gray-500">Task #{task.id}</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isEditing ? (
            <>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-xl font-semibold bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a description..."
                rows={4}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
              />
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-white">{task.title}</h2>
              {task.description ? (
                <p className="text-gray-400 whitespace-pre-wrap">
                  {task.description}
                </p>
              ) : (
                <p className="text-gray-600 italic">No description</p>
              )}
            </>
          )}

          {/* Properties */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                <Tag size={14} />
                Status
              </label>
              {isEditing ? (
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Task['status'])}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  {statusOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-white capitalize">
                  {status.replace('_', ' ')}
                </p>
              )}
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                Priority
              </label>
              {isEditing ? (
                <select
                  value={priority}
                  onChange={(e) =>
                    setPriority(e.target.value as Task['priority'])
                  }
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  {priorityOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-white capitalize">{priority}</p>
              )}
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                <User size={14} />
                Assignee
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  placeholder="Username"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              ) : (
                <p className="text-white">{task.assignee || 'Unassigned'}</p>
              )}
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                <Calendar size={14} />
                Due Date
              </label>
              {isEditing ? (
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              ) : (
                <p className="text-white">
                  {task.due_date
                    ? new Date(task.due_date).toLocaleDateString()
                    : 'No due date'}
                </p>
              )}
            </div>
          </div>

          {/* Labels */}
          {task.labels.length > 0 && (
            <div>
              <label className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                <Tag size={14} />
                Labels
              </label>
              <div className="flex flex-wrap gap-2">
                {task.labels.map((label) => (
                  <span
                    key={label.id}
                    className="text-sm px-2 py-1 rounded"
                    style={{
                      backgroundColor: `${label.color}30`,
                      color: label.color,
                    }}
                  >
                    {label.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Comments */}
          <div>
            <label className="flex items-center gap-2 text-sm text-gray-500 mb-2">
              <MessageSquare size={14} />
              Comments ({task.comments.length})
            </label>
            <div className="space-y-3 mb-3">
              {task.comments.map((comment) => (
                <div
                  key={comment.id}
                  className="bg-gray-800 rounded-lg p-3"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-white">
                      {comment.author}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(comment.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 whitespace-pre-wrap">
                    {comment.content}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
              />
              <button
                onClick={handleAddComment}
                disabled={!newComment.trim()}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded-lg transition-colors"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 flex items-center justify-between">
          <button
            onClick={handleArchive}
            className="flex items-center gap-2 px-3 py-2 text-gray-400 hover:text-red-400 transition-colors"
          >
            <Archive size={18} />
            Archive
          </button>

          <div className="flex gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded-lg transition-colors"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                Edit
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
