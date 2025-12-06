import { useState, useEffect, useCallback } from 'react';
import { documentsApi, type Document, type DocumentSummary } from '../services/api';
import {
  FileText,
  Plus,
  Search,
  ChevronRight,
  ChevronDown,
  Pin,
  Trash2,
  Edit2,
  Save,
  X,
  ArrowLeft,
} from 'lucide-react';

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DocumentSummary[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedDocs, setExpandedDocs] = useState<Set<number>>(new Set());

  // Editor state
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editPinned, setEditPinned] = useState(false);
  const [createParentId, setCreateParentId] = useState<number | null>(null);

  const loadDocuments = useCallback(async () => {
    try {
      setIsLoading(true);
      const docs = await documentsApi.getTree();
      setDocuments(docs);
    } catch (error) {
      console.error('Failed to load documents:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleSearch = async () => {
    if (searchQuery.length < 2) {
      setSearchResults(null);
      return;
    }
    try {
      const results = await documentsApi.search(searchQuery);
      setSearchResults(results);
    } catch (error) {
      console.error('Search failed:', error);
    }
  };

  useEffect(() => {
    const debounce = setTimeout(handleSearch, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery]);

  const handleSelectDocument = async (id: number) => {
    try {
      const doc = await documentsApi.get(id);
      setSelectedDocument(doc);
      setIsEditing(false);
      setIsCreating(false);
      setSearchResults(null);
      setSearchQuery('');
    } catch (error) {
      console.error('Failed to load document:', error);
    }
  };

  const handleStartEdit = () => {
    if (!selectedDocument) return;
    setEditTitle(selectedDocument.title);
    setEditContent(selectedDocument.content);
    setEditPinned(selectedDocument.is_pinned);
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedDocument) return;
    try {
      const updated = await documentsApi.update(selectedDocument.id, {
        title: editTitle,
        content: editContent,
        is_pinned: editPinned,
      });
      setSelectedDocument(updated);
      setIsEditing(false);
      loadDocuments();
    } catch (error) {
      console.error('Failed to save document:', error);
    }
  };

  const handleStartCreate = (parentId: number | null = null) => {
    setCreateParentId(parentId);
    setEditTitle('');
    setEditContent('');
    setEditPinned(false);
    setIsCreating(true);
    setIsEditing(false);
    setSelectedDocument(null);
  };

  const handleCreate = async () => {
    try {
      const doc = await documentsApi.create({
        title: editTitle,
        content: editContent,
        parent_id: createParentId || undefined,
        is_pinned: editPinned,
      });
      setSelectedDocument(doc);
      setIsCreating(false);
      loadDocuments();
    } catch (error) {
      console.error('Failed to create document:', error);
    }
  };

  const handleDelete = async () => {
    if (!selectedDocument || !confirm('Delete this document and all its children?')) return;
    try {
      await documentsApi.delete(selectedDocument.id);
      setSelectedDocument(null);
      loadDocuments();
    } catch (error) {
      console.error('Failed to delete document:', error);
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const displayDocs = searchResults !== null ? searchResults : documents;

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <div className="text-gray-400">Loading documents...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Sidebar - Document List */}
      <div className="w-80 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-white">Documents</h2>
            <button
              onClick={() => handleStartCreate(null)}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
              title="New Document"
            >
              <Plus size={18} />
            </button>
          </div>
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              placeholder="Search..."
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {displayDocs.length === 0 ? (
            <p className="text-center text-gray-500 text-sm py-4">
              {searchResults !== null ? 'No results found' : 'No documents yet'}
            </p>
          ) : (
            <DocumentTree
              documents={displayDocs}
              expandedDocs={expandedDocs}
              selectedId={selectedDocument?.id}
              onSelect={handleSelectDocument}
              onToggleExpand={toggleExpand}
              onCreateChild={handleStartCreate}
              isSearchResult={searchResults !== null}
            />
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {isCreating ? (
          <DocumentEditor
            title={editTitle}
            content={editContent}
            isPinned={editPinned}
            onTitleChange={setEditTitle}
            onContentChange={setEditContent}
            onPinnedChange={setEditPinned}
            onSave={handleCreate}
            onCancel={() => setIsCreating(false)}
            isNew
          />
        ) : isEditing && selectedDocument ? (
          <DocumentEditor
            title={editTitle}
            content={editContent}
            isPinned={editPinned}
            onTitleChange={setEditTitle}
            onContentChange={setEditContent}
            onPinnedChange={setEditPinned}
            onSave={handleSaveEdit}
            onCancel={() => setIsEditing(false)}
          />
        ) : selectedDocument ? (
          <DocumentViewer
            document={selectedDocument}
            onEdit={handleStartEdit}
            onDelete={handleDelete}
            onBack={() => setSelectedDocument(null)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <FileText size={48} className="mx-auto text-gray-700 mb-4" />
              <p className="text-gray-500 mb-4">
                Select a document or create a new one
              </p>
              <button
                onClick={() => handleStartCreate(null)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Create Document
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DocumentTree({
  documents,
  expandedDocs,
  selectedId,
  onSelect,
  onToggleExpand,
  onCreateChild,
  isSearchResult,
  level = 0,
}: {
  documents: DocumentSummary[];
  expandedDocs: Set<number>;
  selectedId?: number;
  onSelect: (id: number) => void;
  onToggleExpand: (id: number) => void;
  onCreateChild: (parentId: number) => void;
  isSearchResult: boolean;
  level?: number;
}) {
  return (
    <ul className="space-y-0.5">
      {documents.map((doc) => {
        const isExpanded = expandedDocs.has(doc.id);
        const isSelected = selectedId === doc.id;

        return (
          <li key={doc.id}>
            <div
              className={`flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer group ${
                isSelected
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
              style={{ paddingLeft: `${8 + level * 16}px` }}
            >
              {doc.has_children && !isSearchResult ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleExpand(doc.id);
                  }}
                  className="p-0.5 hover:bg-gray-700 rounded"
                >
                  {isExpanded ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                </button>
              ) : (
                <span className="w-5" />
              )}

              <button
                onClick={() => onSelect(doc.id)}
                className="flex-1 flex items-center gap-2 text-left min-w-0"
              >
                <FileText size={14} className="flex-shrink-0" />
                <span className="truncate text-sm">{doc.title}</span>
                {doc.is_pinned && (
                  <Pin size={12} className="flex-shrink-0 text-amber-400" />
                )}
              </button>

              {!isSearchResult && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCreateChild(doc.id);
                  }}
                  className={`p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                    isSelected ? 'hover:bg-blue-500' : 'hover:bg-gray-700'
                  }`}
                  title="Add child document"
                >
                  <Plus size={14} />
                </button>
              )}
            </div>

            {isExpanded && doc.has_children && !isSearchResult && (
              <DocumentTreeChildren
                parentId={doc.id}
                expandedDocs={expandedDocs}
                selectedId={selectedId}
                onSelect={onSelect}
                onToggleExpand={onToggleExpand}
                onCreateChild={onCreateChild}
                level={level + 1}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function DocumentTreeChildren({
  parentId,
  expandedDocs,
  selectedId,
  onSelect,
  onToggleExpand,
  onCreateChild,
  level,
}: {
  parentId: number;
  expandedDocs: Set<number>;
  selectedId?: number;
  onSelect: (id: number) => void;
  onToggleExpand: (id: number) => void;
  onCreateChild: (parentId: number) => void;
  level: number;
}) {
  const [children, setChildren] = useState<DocumentSummary[]>([]);

  useEffect(() => {
    documentsApi.getAll(parentId).then(setChildren).catch(console.error);
  }, [parentId]);

  if (children.length === 0) return null;

  return (
    <DocumentTree
      documents={children}
      expandedDocs={expandedDocs}
      selectedId={selectedId}
      onSelect={onSelect}
      onToggleExpand={onToggleExpand}
      onCreateChild={onCreateChild}
      isSearchResult={false}
      level={level}
    />
  );
}

function DocumentViewer({
  document,
  onEdit,
  onDelete,
  onBack,
}: {
  document: Document;
  onEdit: () => void;
  onDelete: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors lg:hidden"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-white flex items-center gap-2">
              {document.title}
              {document.is_pinned && <Pin size={16} className="text-amber-400" />}
            </h1>
            <p className="text-xs text-gray-500">
              Last edited by {document.last_edited_by} on{' '}
              {new Date(document.updated_at).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
          >
            <Edit2 size={16} />
            Edit
          </button>
          <button
            onClick={onDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded transition-colors"
          >
            <Trash2 size={16} />
            Delete
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          {document.content ? (
            <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap">
              {document.content}
            </div>
          ) : (
            <p className="text-gray-500 italic">No content yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function DocumentEditor({
  title,
  content,
  isPinned,
  onTitleChange,
  onContentChange,
  onPinnedChange,
  onSave,
  onCancel,
  isNew = false,
}: {
  title: string;
  content: string;
  isPinned: boolean;
  onTitleChange: (title: string) => void;
  onContentChange: (content: string) => void;
  onPinnedChange: (pinned: boolean) => void;
  onSave: () => void;
  onCancel: () => void;
  isNew?: boolean;
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex items-center justify-between">
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Document title..."
          className="text-xl font-semibold bg-transparent text-white placeholder-gray-500 focus:outline-none flex-1 mr-4"
          autoFocus={isNew}
        />
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={isPinned}
              onChange={(e) => onPinnedChange(e.target.checked)}
              className="rounded bg-gray-800 border-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <Pin size={14} />
            Pin
          </label>
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 px-3 py-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
          >
            <X size={16} />
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={!title.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded transition-colors"
          >
            <Save size={16} />
            Save
          </button>
        </div>
      </div>

      {/* Content Editor */}
      <div className="flex-1 overflow-hidden p-6">
        <div className="max-w-3xl mx-auto h-full">
          <textarea
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            placeholder="Write your content here... (Markdown supported)"
            className="w-full h-full bg-gray-800 border border-gray-700 rounded-lg p-4 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none font-mono text-sm"
          />
        </div>
      </div>
    </div>
  );
}
