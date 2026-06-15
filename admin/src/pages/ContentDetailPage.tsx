import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  AppWindow,
  ChevronRight,
  FileText,
  Download,
  ListMusic,
  Upload,
  X,
  FileImage,
  History,
  RotateCcw,
  RefreshCw,
} from 'lucide-react';
import { api } from '../lib/api';
import { useToastStore } from '../stores/toast';
import { useAuthStore } from '../stores/auth';
import { formatFileSize, formatDateTime } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import type { Content, ContentVersion } from '../lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTypeBadgeVariant(type: string): 'info' | 'success' | 'neutral' {
  if (type === 'video') return 'info';
  if (type === 'image') return 'success';
  return 'neutral';
}

// ---------------------------------------------------------------------------
// Preview Section
// ---------------------------------------------------------------------------

function ContentPreview({ content }: { content: Content }) {
  if (content.type === 'image') {
    return (
      <div className="bg-surface-100 rounded-xl overflow-hidden flex items-center justify-center">
        <img
          src={content.url}
          alt={content.name}
          className="max-h-[400px] w-auto object-contain"
        />
      </div>
    );
  }

  if (content.type === 'video') {
    return (
      <div className="bg-black rounded-xl overflow-hidden">
        <video
          src={content.url}
          controls
          className="w-full max-h-[400px]"
          preload="metadata"
        />
      </div>
    );
  }

  // Document fallback
  return (
    <div className="bg-surface-100 rounded-xl flex flex-col items-center justify-center py-12">
      <FileText className="h-12 w-12 text-surface-400 mb-3" />
      <p className="text-base text-surface-600 mb-3">{content.name}</p>
      <a
        href={content.url}
        download
        className="h-10 px-3 inline-flex items-center gap-1.5 rounded-xl border border-surface-300 card-bg text-base font-medium text-surface-700 hover:bg-surface-50"
      >
        <Download className="h-3.5 w-3.5" />
        Download
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload New Version Dialog
// ---------------------------------------------------------------------------

interface UploadVersionDialogProps {
  contentType: string;
  open: boolean;
  contentId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function getVersionUploadAccept(contentType: string): string {
  if (contentType === 'video') return 'video/*,.mov';
  if (contentType === 'image') return 'image/*';
  if (contentType === 'audio') return 'audio/*';
  if (contentType === 'document') return '.pdf';
  if (contentType === 'app') return '.zip';
  return 'video/*,.mov,image/*,audio/*,.pdf,.zip';
}

function getVersionUploadHint(contentType: string): string {
  if (contentType === 'video') return 'Allowed: video files, including MOV.';
  if (contentType === 'image') return 'Allowed: image files.';
  if (contentType === 'audio') return 'Allowed: audio files.';
  if (contentType === 'document') return 'Allowed: PDF files.';
  if (contentType === 'app') return 'Allowed: ZIP files.';
  return 'Allowed: video, image, audio, PDF, or ZIP files.';
}

function UploadVersionDialog({
  open,
  contentId,
  contentType,
  onClose,
  onSuccess,
}: UploadVersionDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addToast = useToastStore((s) => s.addToast);
  const token = useAuthStore((s) => s.token);

  // Close on Escape key (only when not uploading)
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !uploading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, uploading, onClose]);

  const reset = useCallback(() => {
    setFile(null);
    setProgress(0);
    setUploading(false);
    setDragOver(false);
  }, []);

  const handleClose = useCallback(() => {
    if (uploading) return;
    reset();
    onClose();
  }, [uploading, reset, onClose]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }, []);

  const handleUpload = useCallback(async () => {
    if (!file) return;

    setUploading(true);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `/api/content/${contentId}`);

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

      addToast('success', 'New version uploaded');
      reset();
      onClose();
      onSuccess();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Upload failed');
      setUploading(false);
    }
  }, [file, contentId, token, addToast, reset, onClose, onSuccess]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={handleClose} />
      <div className="relative bryzos-card rounded-3xl shadow-xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--glass-border)]">
          <h2 className="text-lg font-bold text-surface-900">Upload New Version</h2>
          <button
            onClick={handleClose}
            disabled={uploading}
            aria-label="Close dialog"
            className="h-8 w-8 inline-flex items-center justify-center rounded-xl text-surface-400 hover:text-surface-600 hover:bg-surface-100 disabled:opacity-50 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* Drop zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition-colors ${
              dragOver
                ? 'border-primary-400 bg-primary-50'
                : file
                ? 'border-surface-300 bg-surface-50'
                : 'border-surface-300 hover:border-surface-400'
            }`}
          >
            {file ? (
              <div className="text-center">
                <p className="text-base font-medium text-surface-900">{file.name}</p>
                <p className="text-xs text-surface-500 mt-0.5">
                  {formatFileSize(file.size)}
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
                  Drag &amp; drop or{' '}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-primary-600 hover:text-primary-700 font-medium"
                  >
                    browse
                  </button>
                </p>
                <p className="mt-1 text-xs text-surface-400">
                  {getVersionUploadHint(contentType)}
                </p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={getVersionUploadAccept(contentType)}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setFile(f);
              }}
            />
          </div>

          {/* Progress */}
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

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--glass-border)]">
          <Button variant="secondary" size="sm" onClick={handleClose} disabled={uploading}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleUpload} disabled={!file || uploading} loading={uploading}>
            Upload
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Content Detail Page
// ---------------------------------------------------------------------------

interface UsedByEntry {
  id: string;
  name: string;
  type: 'app' | 'playlist';
}

export function ContentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [uploadVersionOpen, setUploadVersionOpen] = useState(false);
  const addToast = useToastStore((s) => s.addToast);

  // Fetch content detail
  const {
    data: content,
    isLoading: contentLoading,
    refetch: refetchContent,
  } = useQuery({
    queryKey: ['content', id],
    queryFn: () => api.get<Content>(`/content/${id}`),
    enabled: !!id,
  });

  // Fetch version history
  const {
    data: versions = [],
    isLoading: versionsLoading,
    refetch: refetchVersions,
  } = useQuery({
    queryKey: ['content-versions', id],
    queryFn: () => api.get<ContentVersion[]>(`/content/${id}/versions`),
    enabled: !!id,
  });

  // Fetch "used by" references
  const { data: usedBy = [] } = useQuery({
    queryKey: ['content-used-by', id],
    queryFn: () => api.get<UsedByEntry[]>(`/content/${id}/used-by`),
    enabled: !!id,
    retry: false,
  });

  // Rollback mutation
  const rollbackMutation = useMutation({
    mutationFn: (version: number) =>
      api.post(`/content/${id}/rollback`, { version }),
    onSuccess: () => {
      addToast('success', 'Content rolled back successfully');
      refetchContent();
      refetchVersions();
      queryClient.invalidateQueries({ queryKey: ['content'] });
    },
    onError: (err) =>
      addToast('error', err instanceof Error ? err.message : 'Rollback failed'),
  });

  const handleRollback = useCallback(
    (version: number) => {
      if (
        window.confirm(
          `Roll back to version ${version}? This will replace the current content.`
        )
      ) {
        rollbackMutation.mutate(version);
      }
    },
    [rollbackMutation]
  );

  const handleVersionUploadSuccess = useCallback(() => {
    refetchContent();
    refetchVersions();
    queryClient.invalidateQueries({ queryKey: ['content'] });
  }, [refetchContent, refetchVersions, queryClient]);

  // Loading
  if (contentLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }

  // Not found
  if (!content) {
    return (
      <EmptyState
        icon={FileImage}
        title="Content not found"
        description="The content item you are looking for does not exist or was deleted."
        action={
          <Button variant="secondary" size="sm" onClick={() => navigate('/content')}>
            Back to Content
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-base">
        <Link
          to="/content"
          className="text-surface-500 hover:text-surface-700 transition-colors"
        >
          Content
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-surface-400" />
        <span className="text-surface-900 font-medium">{content.name}</span>
      </nav>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr,320px] gap-4">
        {/* Main column */}
        <div className="space-y-4">
          {/* Preview */}
          <ContentPreview content={content} />

          {/* Current Version */}
          <div className="bryzos-card rounded-3xl">
            <div className="px-4 py-3 border-b border-[var(--glass-border)] flex items-center justify-between">
              <h2 className="text-lg font-bold text-surface-900">Version</h2>
              <Button size="sm" variant="secondary" onClick={() => setUploadVersionOpen(true)}>
                <Upload className="h-3.5 w-3.5" />
                New Version
              </Button>
            </div>

            <div className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-base font-medium text-surface-900">
                    v{content.current_version}
                  </span>
                  <Badge variant="success">Current</Badge>
                </div>
                <span className="text-base text-surface-500">
                  {formatFileSize(content.file_size)}
                </span>
                <span className="text-base text-surface-500">
                  {formatDateTime(content.updated_at)}
                </span>
              </div>
            </div>
          </div>

          {/* Version History */}
          <div className="bryzos-card rounded-3xl">
            <div className="px-4 py-3 border-b border-[var(--glass-border)] flex items-center justify-between">
              <h2 className="text-lg font-bold text-surface-900 flex items-center gap-1.5">
                <History className="h-3.5 w-3.5 text-surface-400" />
                Version History
              </h2>
              <button
                onClick={() => refetchVersions()}
                className="h-7 w-7 inline-flex items-center justify-center rounded-xl text-surface-400 hover:text-surface-600 hover:bg-surface-100"
                title="Refresh versions"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>

            {versionsLoading ? (
              <div className="flex items-center justify-center py-6">
                <Spinner size="sm" />
              </div>
            ) : versions.length === 0 ? (
              <div className="px-4 py-6 text-center text-base text-surface-500">
                No version history available
              </div>
            ) : (
              <div className="divide-y divide-surface-100">
                {[...versions]
                  .sort((a, b) => b.version_number - a.version_number)
                  .map((v) => {
                    const isCurrent =
                      v.version_number === content.current_version;
                    return (
                      <div
                        key={v.id}
                        className="px-4 py-2.5 flex items-center gap-3 hover:bg-surface-50 transition-colors"
                      >
                        <span className="text-base font-medium text-surface-900">
                          v{v.version_number}
                        </span>
                        {isCurrent && (
                          <Badge variant="success">Current</Badge>
                        )}
                        <span className="text-base text-surface-500">
                          {formatFileSize(v.file_size)}
                        </span>
                        <span
                          className="text-xs text-surface-400 font-mono truncate max-w-[120px]"
                          title={v.hash}
                        >
                          {v.hash.slice(0, 12)}
                        </span>
                        <span className="text-base text-surface-500 ml-auto whitespace-nowrap">
                          {formatDateTime(v.created_at)}
                        </span>
                        {!isCurrent && (
                          <button
                            onClick={() => handleRollback(v.version_number)}
                            disabled={rollbackMutation.isPending}
                            className="h-9 px-2 inline-flex items-center gap-1 rounded-xl border border-surface-300 text-base text-surface-600 hover:bg-surface-50 disabled:opacity-50"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Rollback
                          </button>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Metadata card */}
          <div className="bryzos-card rounded-3xl p-4">
            <h3 className="text-xs font-medium text-surface-500 uppercase mb-3">
              Details
            </h3>
            <div className="space-y-2.5">
              <div>
                <div className="text-xs text-surface-500">Name</div>
                <div className="text-base text-surface-900 font-medium">{content.name}</div>
              </div>
              {content.description && (
                <div>
                  <div className="text-xs text-surface-500">Description</div>
                  <div className="text-base text-surface-700">{content.description}</div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-surface-500">Type</div>
                  <div className="mt-0.5">
                    <Badge variant={getTypeBadgeVariant(content.type)}>
                      {content.type}
                    </Badge>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-surface-500">Version</div>
                  <div className="text-base text-surface-900">v{content.current_version}</div>
                </div>
              </div>
              <div>
                <div className="text-xs text-surface-500">File Size</div>
                <div className="text-base text-surface-900">
                  {formatFileSize(content.file_size)}
                </div>
              </div>
              <div>
                <div className="text-xs text-surface-500">Hash</div>
                <div className="text-xs text-surface-600 font-mono truncate" title={content.hash}>
                  {content.hash}
                </div>
              </div>
            </div>
          </div>

          {/* Created info card */}
          <div className="bryzos-card rounded-3xl p-4">
            <h3 className="text-xs font-medium text-surface-500 uppercase mb-3">
              Created
            </h3>
            <div className="space-y-2.5">
              <div>
                <div className="text-xs text-surface-500">Created By</div>
                <div className="text-base text-surface-900">{content.created_by}</div>
              </div>
              <div>
                <div className="text-xs text-surface-500">Created At</div>
                <div className="text-base text-surface-900">
                  {formatDateTime(content.created_at)}
                </div>
              </div>
            </div>
          </div>

          {/* Used By card */}
          <div className="bryzos-card rounded-3xl p-4">
            <h3 className="text-xs font-medium text-surface-500 uppercase mb-3">
              Used By
            </h3>
            {usedBy.length === 0 ? (
              <p className="text-base text-surface-400">Not used by any apps or playlists.</p>
            ) : (
              <div className="space-y-1">
                {usedBy.map((ref) => (
                  <button
                    key={ref.id}
                    onClick={() => navigate(ref.type === 'app' ? `/apps/${ref.id}` : `/playlists/${ref.id}`)}
                    className="w-full h-10 px-2 inline-flex items-center gap-2 rounded-xl text-base text-primary-600 hover:text-primary-700 hover:bg-surface-100 transition-colors"
                  >
                    {ref.type === 'app' ? <AppWindow className="h-3.5 w-3.5" /> : <ListMusic className="h-3.5 w-3.5" />}
                    {ref.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick actions card */}
          <div className="bryzos-card rounded-3xl p-4">
            <h3 className="text-xs font-medium text-surface-500 uppercase mb-3">
              Actions
            </h3>
            <div className="space-y-1">
              <a
                href={content.url}
                download
                className="w-full h-10 px-2 inline-flex items-center gap-2 rounded-xl text-base text-surface-700 hover:text-surface-900 hover:bg-surface-100 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Download current version
              </a>
              <button
                onClick={() => setUploadVersionOpen(true)}
                className="w-full h-10 px-2 inline-flex items-center gap-2 rounded-xl text-base text-surface-700 hover:text-surface-900 hover:bg-surface-100 transition-colors"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload new version
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Upload new version dialog */}
      <UploadVersionDialog
        open={uploadVersionOpen}
        contentId={id ?? ''}
        contentType={content.type}
        onClose={() => setUploadVersionOpen(false)}
        onSuccess={handleVersionUploadSuccess}
      />
    </div>
  );
}
