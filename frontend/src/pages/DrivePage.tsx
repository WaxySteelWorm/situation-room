import { useState, useEffect, useCallback, useRef } from 'react';
import { driveApi } from '../services/api';
import type { SharedDrive, DriveFile, BreadcrumbItem } from '../types';
import {
  HardDrive,
  Folder,
  File,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileSpreadsheet,
  Presentation,
  Download,
  Trash2,
  Edit3,
  Move,
  FolderPlus,
  Upload,
  Search,
  ChevronRight,
  Home,
  X,
  MoreVertical,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';

type SortField = 'name' | 'modified_time' | 'size' | 'mime_type';
type SortDirection = 'asc' | 'desc';

// File type icon mapping
function getFileIcon(mimeType: string) {
  if (mimeType === 'application/vnd.google-apps.folder') return Folder;
  if (mimeType.startsWith('image/')) return FileImage;
  if (mimeType.startsWith('video/')) return FileVideo;
  if (mimeType.startsWith('audio/')) return FileAudio;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return FileSpreadsheet;
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return Presentation;
  if (mimeType.includes('document') || mimeType.includes('word') || mimeType === 'application/pdf' || mimeType.startsWith('text/')) return FileText;
  return File;
}

// Format file size
function formatSize(bytes: number | null): string {
  if (bytes === null || bytes === 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// Format date
function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Check if file can be previewed
function canPreview(mimeType: string): boolean {
  return (
    mimeType === 'application/pdf' ||
    mimeType.startsWith('image/') ||
    mimeType.startsWith('text/') ||
    mimeType.includes('google-apps.document') ||
    mimeType.includes('google-apps.spreadsheet') ||
    mimeType.includes('google-apps.presentation')
  );
}

export default function DrivePage() {
  // State
  const [drives, setDrives] = useState<SharedDrive[]>([]);
  const [selectedDrive, setSelectedDrive] = useState<SharedDrive | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DriveFile[] | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Modal states
  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);
  const [renameFile, setRenameFile] = useState<DriveFile | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [moveFile, setMoveFile] = useState<DriveFile | null>(null);
  const [deleteFile, setDeleteFile] = useState<DriveFile | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [contextMenu, setContextMenu] = useState<{ file: DriveFile; x: number; y: number } | null>(null);

  // Upload state
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Map<string, number>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Enabled check
  const [isEnabled, setIsEnabled] = useState<boolean | null>(null);

  // Check if Google Drive is enabled
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const status = await driveApi.getStatus();
        setIsEnabled(status.enabled);
        if (status.enabled) {
          loadDrives();
        }
      } catch {
        setIsEnabled(false);
        setError('Failed to check Google Drive status');
      } finally {
        setIsLoading(false);
      }
    };
    checkStatus();
  }, []);

  // Load available drives
  const loadDrives = async () => {
    try {
      const driveList = await driveApi.getDrives();
      setDrives(driveList);
      if (driveList.length > 0) {
        setSelectedDrive(driveList[0]);
      }
    } catch (err) {
      setError('Failed to load drives');
    }
  };

  // Load files when drive or folder changes
  useEffect(() => {
    if (selectedDrive) {
      loadFiles();
      loadBreadcrumbs();
    }
  }, [selectedDrive, currentFolderId]);

  const loadFiles = async () => {
    if (!selectedDrive) return;

    setIsLoading(true);
    setError(null);
    setSearchResults(null);
    setSearchQuery('');

    try {
      const orderBy = sortField === 'name' ? 'folder,name' :
                      sortField === 'modified_time' ? `folder,modifiedTime ${sortDirection}` :
                      'folder,name';
      const response = await driveApi.listFiles(
        selectedDrive.id,
        currentFolderId || undefined,
        undefined,
        100,
        orderBy
      );
      setFiles(response.files);
    } catch (err) {
      setError('Failed to load files');
    } finally {
      setIsLoading(false);
    }
  };

  const loadBreadcrumbs = async () => {
    if (!selectedDrive) return;

    try {
      const crumbs = await driveApi.getBreadcrumbs(
        selectedDrive.id,
        currentFolderId || undefined
      );
      setBreadcrumbs(crumbs);
    } catch {
      setBreadcrumbs([]);
    }
  };

  // Search
  const handleSearch = async () => {
    if (!selectedDrive || !searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    setIsLoading(true);
    try {
      const results = await driveApi.searchFiles(selectedDrive.id, searchQuery.trim());
      setSearchResults(results);
    } catch {
      setError('Search failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Clear search
  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
  };

  // Navigation
  const navigateToFolder = (folderId: string | null) => {
    setCurrentFolderId(folderId);
    setSearchResults(null);
    setSearchQuery('');
  };

  const navigateToRoot = () => {
    navigateToFolder(null);
  };

  // Sort files
  const sortedFiles = useCallback(() => {
    const filesToSort = searchResults || files;
    return [...filesToSort].sort((a, b) => {
      // Folders always first
      if (a.is_folder && !b.is_folder) return -1;
      if (!a.is_folder && b.is_folder) return 1;

      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'modified_time':
          comparison = new Date(a.modified_time).getTime() - new Date(b.modified_time).getTime();
          break;
        case 'size':
          comparison = (a.size || 0) - (b.size || 0);
          break;
        case 'mime_type':
          comparison = a.mime_type.localeCompare(b.mime_type);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [files, searchResults, sortField, sortDirection]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // File actions
  const handleDownload = (file: DriveFile) => {
    window.open(driveApi.downloadFile(file.id), '_blank');
  };

  const handleRename = async () => {
    if (!renameFile || !renameValue.trim()) return;

    try {
      await driveApi.renameFile(renameFile.id, renameValue.trim());
      setRenameFile(null);
      setRenameValue('');
      loadFiles();
    } catch {
      setError('Failed to rename file');
    }
  };

  const handleMove = async (targetFolderId: string) => {
    if (!moveFile) return;

    try {
      await driveApi.moveFile(moveFile.id, targetFolderId);
      setMoveFile(null);
      loadFiles();
    } catch {
      setError('Failed to move file');
    }
  };

  const handleDelete = async () => {
    if (!deleteFile) return;

    try {
      await driveApi.deleteFile(deleteFile.id);
      setDeleteFile(null);
      loadFiles();
    } catch {
      setError('Failed to delete file');
    }
  };

  const handleCreateFolder = async () => {
    if (!selectedDrive || !newFolderName.trim()) return;

    try {
      await driveApi.createFolder(
        selectedDrive.id,
        currentFolderId || selectedDrive.id,
        newFolderName.trim()
      );
      setShowNewFolder(false);
      setNewFolderName('');
      loadFiles();
    } catch {
      setError('Failed to create folder');
    }
  };

  // Upload handling
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    await uploadFiles(droppedFiles);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
    await uploadFiles(selectedFiles);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadFiles = async (filesToUpload: File[]) => {
    if (!selectedDrive || filesToUpload.length === 0) return;

    const parentId = currentFolderId || selectedDrive.id;

    for (const file of filesToUpload) {
      const fileKey = `${file.name}-${Date.now()}`;
      setUploadProgress(prev => new Map(prev).set(fileKey, 0));

      try {
        await driveApi.uploadFile(selectedDrive.id, parentId, file);
        setUploadProgress(prev => {
          const newMap = new Map(prev);
          newMap.delete(fileKey);
          return newMap;
        });
      } catch {
        setError(`Failed to upload ${file.name}`);
        setUploadProgress(prev => {
          const newMap = new Map(prev);
          newMap.delete(fileKey);
          return newMap;
        });
      }
    }

    loadFiles();
  };

  // Context menu
  const handleContextMenu = (e: React.MouseEvent, file: DriveFile) => {
    e.preventDefault();
    setContextMenu({ file, x: e.clientX, y: e.clientY });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  // Click outside to close context menu
  useEffect(() => {
    const handleClick = () => closeContextMenu();
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // Not enabled state
  if (isEnabled === false) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-full">
        <HardDrive size={64} className="text-gray-600 mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Google Drive Not Enabled</h2>
        <p className="text-gray-400 text-center max-w-md">
          Google Drive integration is not enabled. Configure your service account
          credentials and shared drives in the config file to enable this feature.
        </p>
      </div>
    );
  }

  // Loading state
  if (isLoading && !files.length && !searchResults) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div
      className={`p-6 h-full flex flex-col ${isDragging ? 'bg-blue-500/10' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-white">Files</h1>

          {/* Drive Selector */}
          {drives.length > 0 && (
            <select
              value={selectedDrive?.id || ''}
              onChange={(e) => {
                const drive = drives.find(d => d.id === e.target.value);
                if (drive) {
                  setSelectedDrive(drive);
                  setCurrentFolderId(null);
                }
              }}
              className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {drives.map(drive => (
                <option key={drive.id} value={drive.id}>
                  {drive.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search files..."
              className="bg-gray-800 border border-gray-700 text-white rounded-lg pl-10 pr-8 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Action buttons */}
          <button
            onClick={() => setShowNewFolder(true)}
            className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm transition-colors"
          >
            <FolderPlus size={16} />
            New Folder
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors"
          >
            <Upload size={16} />
            Upload
          </button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          <button
            onClick={loadFiles}
            className="p-2 text-gray-400 hover:text-white transition-colors"
            title="Refresh"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 mb-4 text-sm">
        <button
          onClick={navigateToRoot}
          className="flex items-center gap-1 px-2 py-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
        >
          <Home size={16} />
          {selectedDrive?.name || 'Root'}
        </button>

        {breadcrumbs.map((crumb, index) => (
          <span key={crumb.id} className="flex items-center">
            <ChevronRight size={16} className="text-gray-600" />
            <button
              onClick={() => navigateToFolder(crumb.id)}
              className={`px-2 py-1 rounded transition-colors ${
                index === breadcrumbs.length - 1
                  ? 'text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              {crumb.name}
            </button>
          </span>
        ))}

        {searchResults && (
          <span className="flex items-center ml-4 text-gray-500">
            <Search size={14} className="mr-1" />
            Search results for "{searchQuery}"
          </span>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle size={18} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto hover:text-white">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Upload progress */}
      {uploadProgress.size > 0 && (
        <div className="mb-4 space-y-2">
          {Array.from(uploadProgress.entries()).map(([key, progress]) => (
            <div key={key} className="bg-gray-800 rounded-lg p-3">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-white">{key.split('-')[0]}</span>
                <span className="text-gray-400">{progress}%</span>
              </div>
              <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-blue-500/20 border-2 border-dashed border-blue-500 rounded-xl flex items-center justify-center z-10 pointer-events-none">
          <div className="text-center">
            <Upload size={48} className="mx-auto mb-2 text-blue-400" />
            <p className="text-lg text-blue-400">Drop files here to upload</p>
          </div>
        </div>
      )}

      {/* File list */}
      <div className="flex-1 bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gray-800/50 border-b border-gray-800 text-sm font-medium text-gray-400">
          <button
            onClick={() => toggleSort('name')}
            className="col-span-5 flex items-center gap-1 hover:text-white transition-colors text-left"
          >
            Name
            {sortField === 'name' && (
              sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
            )}
          </button>
          <button
            onClick={() => toggleSort('modified_time')}
            className="col-span-3 flex items-center gap-1 hover:text-white transition-colors text-left"
          >
            Modified
            {sortField === 'modified_time' && (
              sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
            )}
          </button>
          <button
            onClick={() => toggleSort('size')}
            className="col-span-2 flex items-center gap-1 hover:text-white transition-colors text-left"
          >
            Size
            {sortField === 'size' && (
              sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
            )}
          </button>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        {/* File rows */}
        <div className="overflow-y-auto max-h-[calc(100vh-320px)]">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">Loading files...</div>
          ) : sortedFiles().length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {searchResults ? 'No files found' : 'This folder is empty'}
            </div>
          ) : (
            sortedFiles().map((file) => {
              const FileIcon = getFileIcon(file.mime_type);
              return (
                <div
                  key={file.id}
                  className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-gray-800/50 border-b border-gray-800/50 items-center group"
                  onContextMenu={(e) => handleContextMenu(e, file)}
                >
                  {/* Name */}
                  <div className="col-span-5 flex items-center gap-3 min-w-0">
                    <FileIcon
                      size={20}
                      className={file.is_folder ? 'text-yellow-400 flex-shrink-0' : 'text-gray-400 flex-shrink-0'}
                    />
                    {file.is_folder ? (
                      <button
                        onClick={() => navigateToFolder(file.id)}
                        className="text-white hover:text-blue-400 truncate text-left"
                      >
                        {file.name}
                      </button>
                    ) : canPreview(file.mime_type) ? (
                      <button
                        onClick={() => setPreviewFile(file)}
                        className="text-white hover:text-blue-400 truncate text-left"
                      >
                        {file.name}
                      </button>
                    ) : (
                      <span className="text-white truncate">{file.name}</span>
                    )}
                  </div>

                  {/* Modified */}
                  <div className="col-span-3 text-gray-400 text-sm truncate">
                    <div>{formatDate(file.modified_time)}</div>
                    {file.modified_by && (
                      <div className="text-xs text-gray-500 truncate">{file.modified_by}</div>
                    )}
                  </div>

                  {/* Size */}
                  <div className="col-span-2 text-gray-400 text-sm">
                    {formatSize(file.size)}
                  </div>

                  {/* Actions */}
                  <div className="col-span-2 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!file.is_folder && (
                      <button
                        onClick={() => handleDownload(file)}
                        className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                        title="Download"
                      >
                        <Download size={16} />
                      </button>
                    )}
                    {file.web_view_link && (
                      <a
                        href={file.web_view_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                        title="Open in Google Drive"
                      >
                        <ExternalLink size={16} />
                      </a>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setContextMenu({ file, x: e.currentTarget.getBoundingClientRect().right, y: e.currentTarget.getBoundingClientRect().bottom });
                      }}
                      className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                    >
                      <MoreVertical size={16} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 z-50 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {!contextMenu.file.is_folder && (
            <button
              onClick={() => {
                handleDownload(contextMenu.file);
                closeContextMenu();
              }}
              className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
            >
              <Download size={16} />
              Download
            </button>
          )}
          {canPreview(contextMenu.file.mime_type) && (
            <button
              onClick={() => {
                setPreviewFile(contextMenu.file);
                closeContextMenu();
              }}
              className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
            >
              <FileText size={16} />
              Preview
            </button>
          )}
          <button
            onClick={() => {
              setRenameFile(contextMenu.file);
              setRenameValue(contextMenu.file.name);
              closeContextMenu();
            }}
            className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
          >
            <Edit3 size={16} />
            Rename
          </button>
          <button
            onClick={() => {
              setMoveFile(contextMenu.file);
              closeContextMenu();
            }}
            className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
          >
            <Move size={16} />
            Move
          </button>
          <div className="border-t border-gray-700 my-1" />
          <button
            onClick={() => {
              setDeleteFile(contextMenu.file);
              closeContextMenu();
            }}
            className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-gray-700 flex items-center gap-2"
          >
            <Trash2 size={16} />
            Delete
          </button>
        </div>
      )}

      {/* Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h3 className="text-lg font-semibold text-white truncate">{previewFile.name}</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownload(previewFile)}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                >
                  <Download size={20} />
                </button>
                <button
                  onClick={() => setPreviewFile(null)}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {previewFile.mime_type === 'application/pdf' ? (
                <iframe
                  src={driveApi.previewFile(previewFile.id)}
                  className="w-full h-[70vh] bg-white rounded"
                  title={previewFile.name}
                />
              ) : previewFile.mime_type.startsWith('image/') ? (
                <img
                  src={driveApi.previewFile(previewFile.id)}
                  alt={previewFile.name}
                  className="max-w-full max-h-[70vh] mx-auto object-contain"
                />
              ) : previewFile.mime_type.includes('google-apps') ? (
                <div className="text-center py-12">
                  <FileText size={64} className="mx-auto mb-4 text-blue-400" />
                  <p className="text-gray-400 mb-2">Google {previewFile.mime_type.includes('document') ? 'Doc' : previewFile.mime_type.includes('spreadsheet') ? 'Sheet' : previewFile.mime_type.includes('presentation') ? 'Slide' : 'File'}</p>
                  <p className="text-gray-500 text-sm mb-4">Google Docs cannot be previewed inline due to security restrictions.</p>
                  <a
                    href={previewFile.web_view_link || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                  >
                    <ExternalLink size={18} />
                    Open in Google Drive
                  </a>
                </div>
              ) : (
                <div className="text-center py-12">
                  <File size={64} className="mx-auto mb-4 text-gray-600" />
                  <p className="text-gray-400">Preview not available for this file type</p>
                  <button
                    onClick={() => handleDownload(previewFile)}
                    className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                  >
                    Download File
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameFile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-white mb-4">Rename</h3>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRenameFile(null)}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRename}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move Modal */}
      {moveFile && selectedDrive && (
        <MoveModal
          file={moveFile}
          driveId={selectedDrive.id}
          currentFolderId={currentFolderId}
          onMove={handleMove}
          onClose={() => setMoveFile(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteFile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-white mb-2">Delete {deleteFile.is_folder ? 'Folder' : 'File'}</h3>
            <p className="text-gray-400 mb-4">
              Are you sure you want to delete "{deleteFile.name}"? This will move it to trash.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteFile(null)}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Folder Modal */}
      {showNewFolder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-white mb-4">New Folder</h3>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
              placeholder="Folder name"
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowNewFolder(false);
                  setNewFolderName('');
                }}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFolder}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Move Modal Component
function MoveModal({
  file,
  driveId,
  currentFolderId,
  onMove,
  onClose,
}: {
  file: DriveFile;
  driveId: string;
  currentFolderId: string | null;
  onMove: (folderId: string) => void;
  onClose: () => void;
}) {
  const [folders, setFolders] = useState<DriveFile[]>([]);
  const [browseFolderId, setBrowseFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadFolders();
  }, [browseFolderId]);

  const loadFolders = async () => {
    setIsLoading(true);
    try {
      const response = await driveApi.listFiles(driveId, browseFolderId || undefined);
      setFolders(response.files.filter(f => f.is_folder && f.id !== file.id));

      const crumbs = await driveApi.getBreadcrumbs(driveId, browseFolderId || undefined);
      setBreadcrumbs(crumbs);
    } catch {
      // Ignore errors
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-xl p-6 max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
        <h3 className="text-lg font-semibold text-white mb-4">Move "{file.name}"</h3>

        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 mb-4 text-sm overflow-x-auto">
          <button
            onClick={() => setBrowseFolderId(null)}
            className="flex items-center gap-1 px-2 py-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors flex-shrink-0"
          >
            <Home size={16} />
            Root
          </button>
          {breadcrumbs.map((crumb) => (
            <span key={crumb.id} className="flex items-center flex-shrink-0">
              <ChevronRight size={16} className="text-gray-600" />
              <button
                onClick={() => setBrowseFolderId(crumb.id)}
                className="px-2 py-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>

        {/* Folder list */}
        <div className="flex-1 overflow-y-auto bg-gray-800 rounded-lg mb-4 min-h-[200px]">
          {isLoading ? (
            <div className="p-4 text-center text-gray-500">Loading...</div>
          ) : folders.length === 0 ? (
            <div className="p-4 text-center text-gray-500">No folders</div>
          ) : (
            folders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => setBrowseFolderId(folder.id)}
                className="w-full px-4 py-3 text-left text-gray-300 hover:bg-gray-700 flex items-center gap-3 border-b border-gray-700 last:border-b-0"
              >
                <Folder size={20} className="text-yellow-400 flex-shrink-0" />
                <span className="truncate">{folder.name}</span>
              </button>
            ))
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-between">
          <button
            onClick={() => onMove(browseFolderId || driveId)}
            disabled={browseFolderId === currentFolderId}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
          >
            Move Here
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
