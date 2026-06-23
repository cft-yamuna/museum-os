import { useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Upload,
  LayoutGrid,
  List,
  Film,
  FileText,
  Image,
  X,
  FileImage,
  Monitor,
  Trash2,
} from 'lucide-react';
import { api } from '../lib/api';
import { useSiteStore } from '../stores/site';
import { useToastStore } from '../stores/toast';
import { useAuthStore } from '../stores/auth';
import { formatFileSize, formatDate } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { AssignToDeviceDialog } from '../components/AssignToDeviceDialog';
import type { Content } from '../lib/types';

type ViewMode = 'grid' | 'list';
type ContentTypeFilter = '' | 'video' | 'image' | 'document';

function getTypeBadgeVariant(type: string): 'info' | 'success' | 'neutral' {
  if (type === 'video') return 'info';
  if (type === 'image') return 'success';
  return 'neutral';
}

function mimeToContentType(mime: string): 'video' | 'image' | 'document' {
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('image/')) return 'image';
  return 'document';
}

function ContentIcon({ type }: { type: string }) {
  if (type === 'video') return <Film className="h-4 w-4" />;
  if (type === 'image') return <Image className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

const CONTENT_UPLOAD_ACCEPT = 'video/*,.mov,image/*,audio/*,.pdf,.zip';
const CONTENT_UPLOAD_HINT = 'Video, MOV, image, audio, PDF, or ZIP files';

// ---------------------------------------------------------------------------
// Upload Dialog
// ---------------------------------------------------------------------------

interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
  onSuccess: () => void;
}

function UploadDialog({ open, onClose, siteId, onSuccess }: UploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addToast = useToastStore((s) => s.addToast);
  const token = useAuthStore((s) => s.token);

  const reset = useCallback(() => {
    setFile(null);
    setName('');
    setDescription('');
    setProgress(0);
    setUploading(false);
    setDragOver(false);
  }, []);

  const handleClose = useCallback(() => {
    if (uploading) return;
    reset();
    onClose();
  }, [uploading, reset, onClose]);

  const handleFileSelect = useCallback(
    (f: File) => {
      setFile(f);
      if (!name) {
        const baseName = f.name.replace(/\.[^.]+$/, '');
        setName(baseName);
      }
    },
    [name]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) handleFileSelect(dropped);
    },
    [handleFileSelect]
  );

  const handleUpload = useCallback(async () => {
    if (!file) return;

    setUploading(true);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', name || file.name);
      formData.append('description', description);
      formData.append('site_id', siteId);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/content');

        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 100));
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            try {
              const json = JSON.parse(xhr.responseText);
              reject(new Error(json.error || 'Upload failed'));
            } catch {
              reject(new Error('Upload failed'));
            }
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Network error')));
        xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));
        xhr.send(formData);
      });

      addToast('success', `"${name || file.name}" uploaded successfully`);
      reset();
      onClose();
      onSuccess();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Upload failed');
      setUploading(false);
    }
  }, [file, name, description, siteId, token, addToast, reset, onClose, onSuccess]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={handleClose} />

      {/* Modal */}
      <div className="admin-card relative mx-4 w-full max-w-md shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200">
          <h2 className="text-lg font-bold text-surface-900">Upload Content</h2>
          <button
            onClick={handleClose}
            disabled={uploading}
            aria-label="Close upload dialog"
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-surface-400 hover:text-surface-600 hover:bg-surface-100 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          {/* Drop zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center rounded-md border-2 border-dashed p-6 transition-colors ${
              dragOver
                ? 'border-primary-400 bg-primary-50'
                : file
                ? 'border-surface-300 bg-surface-50'
                : 'border-surface-300 hover:border-surface-400'
            }`}
          >
            {file ? (
              <div className="text-center">
                <ContentIcon type={mimeToContentType(file.type)} />
                <p className="text-base font-medium text-surface-900 mt-1.5">
                  {file.name}
                </p>
                <p className="text-xs text-surface-500">
                  {formatFileSize(file.size)} &middot; {file.type || 'unknown'}
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                  }}
                  className="mt-2 text-xs text-red-600 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
            ) : (
              <>
                <Upload className="h-6 w-6 text-surface-400 mb-2" />
                <p className="text-base text-surface-600">
                  Drag &amp; drop a file or{' '}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-primary-600 hover:text-primary-700 font-medium"
                  >
                    browse
                  </button>
                </p>
                <p className="text-xs text-surface-400 mt-1">
                  {CONTENT_UPLOAD_HINT}
                </p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={CONTENT_UPLOAD_ACCEPT}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
              }}
            />
          </div>

          {/* Name field */}
          <div>
            <label className="block text-sm font-semibold text-surface-600 mb-1.5">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Content name"
              className="h-10 w-full rounded-md border border-surface-300 px-3 text-sm text-surface-900 placeholder:text-surface-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:bg-surface-100"
            />
          </div>

          {/* Description field */}
          <div>
            <label className="block text-sm font-semibold text-surface-600 mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={2}
              className="w-full resize-none rounded-md border border-surface-300 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:bg-surface-100"
            />
          </div>

          {/* Progress bar */}
          {uploading && (
            <div>
              <div className="flex items-center justify-between text-xs text-surface-600 mb-1">
                <span>Uploading...</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 bg-surface-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-600 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-surface-200">
          <Button variant="secondary" size="sm" onClick={handleClose} disabled={uploading}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleUpload}
            disabled={!file || uploading}
            loading={uploading}
          >
            Upload
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content Grid Card
// ---------------------------------------------------------------------------

function ContentGridCard({
  item,
  onClick,
  onDisplay,
  onDelete,
  selected,
  onSelect,
}: {
  item: Content;
  onClick: () => void;
  onDisplay?: () => void;
  onDelete: () => void;
  selected: boolean;
  onSelect: (e: React.MouseEvent | React.KeyboardEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`admin-card group overflow-hidden text-left transition-colors hover:bg-surface-50 ${
        selected ? 'ring-2 ring-primary-200' : ''
      }`}
    >
      {/* Thumbnail area */}
      <div className="aspect-video bg-surface-100 flex items-center justify-center relative overflow-hidden">
        {item.type === 'image' ? (
          <img
            src={item.url}
            alt={item.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : item.type === 'video' ? (
          <Film className="h-8 w-8 text-surface-400" />
        ) : (
          <FileText className="h-8 w-8 text-surface-400" />
        )}

        {/* Checkbox */}
        <div
          className={`absolute top-1.5 left-1.5 ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
          onClick={onSelect}
          onKeyDown={(e) => { if (e.key === 'Enter') onSelect(e); }}
          role="checkbox"
          aria-checked={selected}
          tabIndex={0}
        >
          <div className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
            selected ? 'bg-primary-600 border-primary-600 text-white' : 'card-bg border-surface-300 hover:border-surface-400'
          }`}>
            {selected && (
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        </div>

        <div className="absolute top-1.5 right-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Display on device button (video only) */}
          {item.type === 'video' && onDisplay && (
            <div
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onDisplay();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.stopPropagation();
                  onDisplay();
                }
              }}
              className="card-bg h-7 w-7 inline-flex items-center justify-center rounded-md text-surface-400 shadow-sm hover:bg-surface-50 hover:text-surface-600"
              title="Display on device"
              aria-label="Display on device"
            >
              <Monitor className="h-3.5 w-3.5" />
            </div>
          )}
          {/* Delete button */}
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.stopPropagation();
                onDelete();
              }
            }}
            className="card-bg h-7 w-7 inline-flex items-center justify-center rounded-md text-red-400 shadow-sm hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-300"
            title="Delete"
            aria-label="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>

      {/* Card body */}
      <div className="p-3">
        <p className="text-base font-medium text-surface-900 truncate">{item.name}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <Badge variant={getTypeBadgeVariant(item.type)}>{item.type}</Badge>
          <span className="text-xs text-surface-400">v{item.current_version}</span>
          <span className="text-xs text-surface-400">{formatFileSize(item.file_size)}</span>
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main Content List Page
// ---------------------------------------------------------------------------

export function ContentListPage() {
  const navigate = useNavigate();
  const activeSiteId = useSiteStore((s) => s.activeSiteId);

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<ContentTypeFilter>('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [displayTarget, setDisplayTarget] = useState<{ url: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const addToast = useToastStore((s) => s.addToast);

  const queryKey = ['content', activeSiteId, typeFilter, search];

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!activeSiteId) return [] as Content[];

      const params = new URLSearchParams();
      params.set('site_id', activeSiteId);
      if (typeFilter) params.set('type', typeFilter);
      if (search) params.set('search', search);

      return api.get<Content[]>(`/content?${params.toString()}`);
    },
    enabled: !!activeSiteId,
  });

  const items = useMemo(() => data ?? [], [data]);

  const toggleSelect = useCallback((id: string, e: React.MouseEvent | React.KeyboardEvent | React.ChangeEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  }, [items, selectedIds.size]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/content/${deleteTarget.id}`);
      addToast('success', `"${deleteTarget.name}" deleted successfully`);
      setDeleteTarget(null);
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(deleteTarget.id); return next; });
      refetch();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, addToast, refetch]);

  const handleBulkDelete = useCallback(async () => {
    setDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      await Promise.all(ids.map((id) => api.delete(`/content/${id}`)));
      addToast('success', `${ids.length} item(s) deleted successfully`);
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      refetch();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Bulk delete failed');
    } finally {
      setDeleting(false);
    }
  }, [selectedIds, addToast, refetch]);

  const hasActiveFilters = search || typeFilter;

  const clearFilters = () => {
    setSearch('');
    setTypeFilter('');
  };

  if (!activeSiteId) {
    return (
      <EmptyState
        icon={FileImage}
        title="No site selected"
        description="Select a site from the header to manage content."
      />
    );
  }

  return (
      <div className="mx-auto max-w-[1400px] space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-surface-500">Library</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-surface-950">Media</h1>
        </div>
        <Button size="sm" onClick={() => setUploadOpen(true)}>
          <Upload className="h-3.5 w-3.5" />
          Upload
        </Button>
      </div>

      {/* Selection toolbar */}
      {selectedIds.size > 0 && (
        <div className="admin-card flex items-center gap-3 border-l-4 border-l-primary-700 px-3 py-2">
          <span className="text-sm font-semibold text-primary-700">
            {selectedIds.size} selected
          </span>
          <button
            onClick={toggleSelectAll}
            className="text-sm font-semibold text-primary-700 hover:text-primary-800"
          >
            {selectedIds.size === items.length ? 'Deselect all' : 'Select all'}
          </button>
          <div className="flex-1" />
          <Button
            size="sm"
            onClick={() => setBulkDeleteOpen(true)}
            variant="danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete ({selectedIds.size})
          </Button>
          <button
            onClick={() => setSelectedIds(new Set())}
            aria-label="Clear selection"
            className="admin-focus inline-flex h-8 w-8 items-center justify-center rounded-md text-surface-400 hover:bg-surface-100 hover:text-surface-700"
            title="Clear selection"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Filter bar */}
      <div className="admin-card flex flex-wrap items-center gap-2 p-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-surface-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            className="card-bg h-10 w-full rounded-md border border-surface-300 pl-8 pr-3 text-sm text-surface-900 placeholder:text-surface-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            placeholder="Search content..."
          />
        </div>

        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value as ContentTypeFilter);
          }}
          className="card-bg h-10 w-[132px] rounded-md border border-surface-300 px-2 text-sm text-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
        >
          <option value="">All types</option>
          <option value="video">Video</option>
          <option value="image">Image</option>
          <option value="document">Document</option>
        </select>

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="admin-focus inline-flex h-10 items-center gap-1 rounded-md px-2 text-sm font-medium text-surface-500 hover:bg-surface-100 hover:text-surface-700"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}

        <div className="flex-1" />

        {/* View toggle */}
        <div className="flex items-center overflow-hidden rounded-md border border-surface-200">
          <button
            onClick={() => setViewMode('grid')}
            className={`h-8 w-8 inline-flex items-center justify-center transition-colors ${
              viewMode === 'grid'
                ? 'bg-surface-100 text-surface-900'
                : 'text-surface-400 hover:text-surface-600'
            }`}
            title="Grid view"
            aria-label="Grid view"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`h-8 w-8 inline-flex items-center justify-center transition-colors ${
              viewMode === 'list'
                ? 'bg-surface-100 text-surface-900'
                : 'text-surface-400 hover:text-surface-600'
            }`}
            title="List view"
            aria-label="List view"
          >
            <List className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && items.length === 0 && (
        <EmptyState
          icon={FileImage}
          title="No content found"
          description={
            hasActiveFilters
              ? 'Try adjusting your search or filters.'
              : 'Upload videos, MOVs, images, audio, PDFs, or ZIPs to use in apps and playlists.'
          }
          action={
            hasActiveFilters ? (
              <Button variant="secondary" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : (
              <Button size="sm" onClick={() => setUploadOpen(true)}>
                <Upload className="h-3.5 w-3.5" />
                Upload
              </Button>
            )
          }
        />
      )}

      {/* Grid view */}
      {!isLoading && items.length > 0 && viewMode === 'grid' && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {items.map((item) => (
            <ContentGridCard
              key={item.id}
              item={item}
              onClick={() => navigate(`/content/${item.id}`)}
              onDisplay={
                item.type === 'video'
                  ? () => setDisplayTarget({ url: item.url, name: item.name })
                  : undefined
              }
              onDelete={() => setDeleteTarget({ id: item.id, name: item.name })}
              selected={selectedIds.has(item.id)}
              onSelect={(e) => toggleSelect(item.id, e)}
            />
          ))}
        </div>
      )}

      {/* List view */}
      {!isLoading && items.length > 0 && viewMode === 'list' && (
        <div className="admin-card overflow-hidden">
          <table className="w-full">
            <thead className="bg-surface-50 border-b border-surface-200">
              <tr>
                <th className="px-3 py-2 w-10">
                  <input
                    type="checkbox"
                    checked={items.length > 0 && selectedIds.size === items.length}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                  />
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-surface-500">
                  Name
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-surface-500">
                  Type
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-surface-500">
                  Version
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-surface-500">
                  Size
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-surface-500">
                  Created By
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-surface-500">
                  Date
                </th>
                <th className="px-3 py-2 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {items.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => navigate(`/content/${item.id}`)}
                  className={`cursor-pointer transition-colors ${
                    selectedIds.has(item.id) ? 'bg-primary-50 hover:bg-primary-100' : 'hover:bg-surface-50'
                  }`}
                >
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={(e) => toggleSelect(item.id, e)}
                      className="h-4 w-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded bg-surface-100 flex items-center justify-center shrink-0">
                        <ContentIcon type={item.type} />
                      </div>
                      <span className="max-w-[200px] truncate text-sm font-semibold text-surface-900">
                        {item.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={getTypeBadgeVariant(item.type)}>{item.type}</Badge>
                  </td>
                  <td className="px-3 py-2 text-sm text-surface-600">v{item.current_version}</td>
                  <td className="px-3 py-2 text-sm text-surface-600">
                    {formatFileSize(item.file_size)}
                  </td>
                  <td className="px-3 py-2 text-sm text-surface-600">{item.created_by}</td>
                  <td className="px-3 py-2 text-sm text-surface-500">
                    {formatDate(item.created_at)}
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      {item.type === 'video' && (
                        <button
                          onClick={() =>
                            setDisplayTarget({ url: item.url, name: item.name })
                          }
                          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-colors"
                          title="Display on device"
                          aria-label="Display on device"
                        >
                          <Monitor className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => setDeleteTarget({ id: item.id, name: item.name })}
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-surface-400 hover:text-red-600 hover:bg-red-500/5 transition-colors"
                        title="Delete"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload dialog */}
      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        siteId={activeSiteId}
        onSuccess={() => {
          refetch();
        }}
      />

      {/* Assign to device dialog */}
      <AssignToDeviceDialog
        open={displayTarget !== null}
        onClose={() => setDisplayTarget(null)}
        siteId={activeSiteId}
        contentUrl={displayTarget?.url}
        contentName={displayTarget?.name}
      />

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => !deleting && setDeleteTarget(null)} />
          <div className="admin-card relative mx-4 w-full max-w-sm shadow-xl">
            <div className="p-4">
              <h3 className="text-lg font-bold text-surface-900">Delete Content</h3>
              <p className="mt-2 text-sm leading-6 text-surface-600">
                Are you sure you want to delete <strong>"{deleteTarget.name}"</strong>? This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-surface-200">
              <Button variant="secondary" size="sm" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleDelete}
                disabled={deleting}
                loading={deleting}
                variant="danger"
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk delete confirmation dialog */}
      {bulkDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => !deleting && setBulkDeleteOpen(false)} />
          <div className="admin-card relative mx-4 w-full max-w-sm shadow-xl">
            <div className="p-4">
              <h3 className="text-lg font-bold text-surface-900">Delete {selectedIds.size} Items</h3>
              <p className="mt-2 text-sm leading-6 text-surface-600">
                Are you sure you want to delete <strong>{selectedIds.size} selected item(s)</strong>? This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-surface-200">
              <Button variant="secondary" size="sm" onClick={() => setBulkDeleteOpen(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleBulkDelete}
                disabled={deleting}
                loading={deleting}
                variant="danger"
              >
                Delete {selectedIds.size} Items
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
