import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ListMusic, Plus, Trash2, X, Monitor, Search } from 'lucide-react';
import clsx from 'clsx';
import { api } from '../lib/api';
import { useSiteStore } from '../stores/site';
import { useToastStore } from '../stores/toast';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { AssignToDeviceDialog } from '../components/AssignToDeviceDialog';
import type { Playlist } from '../lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Create Dialog
// ---------------------------------------------------------------------------

interface CreateDialogProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
  onSuccess: () => void;
}

function CreateDialog({ open, onClose, siteId, onSuccess }: CreateDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const addToast = useToastStore((s) => s.addToast);

  const mutation = useMutation({
    mutationFn: () =>
      api.post<Playlist>('/playlists', {
        site_id: siteId,
        name,
        description,
      }),
    onSuccess: () => {
      addToast('success', `Playlist "${name}" created`);
      setName('');
      setDescription('');
      onClose();
      onSuccess();
    },
    onError: (err: Error) => {
      addToast('error', err.message);
    },
  });

  const handleClose = useCallback(() => {
    if (mutation.isPending) return;
    setName('');
    setDescription('');
    onClose();
  }, [mutation.isPending, onClose]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) return;
      mutation.mutate();
    },
    [name, mutation]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={handleClose} />
      <div className="relative bryzos-card rounded-3xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--glass-border)]">
          <h2 className="text-lg font-bold text-surface-900">Create Playlist</h2>
          <button
            onClick={handleClose}
            disabled={mutation.isPending}
            className="h-7 w-7 inline-flex items-center justify-center rounded-xl text-surface-400 hover:text-surface-600 hover:bg-surface-100 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-4 space-y-5">
            <div>
              <label className="block text-sm font-semibold text-surface-600 mb-1.5">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Playlist name"
                autoFocus
                className="h-10 w-full px-3 rounded-xl border border-surface-300 text-base text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-surface-600 mb-1.5">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                rows={2}
                className="w-full px-3 py-2 rounded-xl border border-surface-300 text-base text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--glass-border)]">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleClose}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!name.trim()}
              loading={mutation.isPending}
            >
              Create
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete Confirmation Dialog
// ---------------------------------------------------------------------------

interface DeleteDialogProps {
  open: boolean;
  playlistName: string;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteDialog({ open, playlistName, loading, onConfirm, onCancel }: DeleteDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={loading ? undefined : onCancel} />
      <div className="relative bryzos-card rounded-3xl shadow-xl w-full max-w-sm mx-4">
        <div className="p-4">
          <h3 className="text-lg font-bold text-surface-900 mb-2">Delete Playlist</h3>
          <p className="text-base text-surface-600">
            Are you sure you want to delete &ldquo;{playlistName}&rdquo;? This action cannot be
            undone.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--glass-border)]">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm} loading={loading}>
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function PlaylistListPage() {
  const navigate = useNavigate();
  const activeSiteId = useSiteStore((s) => s.activeSiteId);
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Playlist | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [displayTarget, setDisplayTarget] = useState<{ id: string; name: string } | null>(null);
  const [search, setSearch] = useState('');

  const { data: playlists = [], isLoading } = useQuery({
    queryKey: ['playlists', activeSiteId],
    queryFn: () => api.get<Playlist[]>(`/playlists?site_id=${activeSiteId}`),
    enabled: !!activeSiteId,
  });

  const filtered = useMemo(() => {
    if (!search) return playlists;
    const q = search.toLowerCase();
    return playlists.filter((p) => p.name.toLowerCase().includes(q));
  }, [playlists, search]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/playlists/${deleteTarget.id}`);
      addToast('success', `Playlist "${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['playlists', activeSiteId] });
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleteLoading(false);
    }
  }, [deleteTarget, activeSiteId, addToast, queryClient]);

  if (!activeSiteId) {
    return (
      <EmptyState
        icon={ListMusic}
        title="No site selected"
        description="Select a site from the header to manage playlists."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-surface-900 leading-tight">Playlists</h1>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Create Playlist
        </Button>
      </div>

      {/* Search */}
      {playlists.length > 0 && (
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-surface-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full pl-8 pr-3 rounded-xl border border-surface-300 bg-surface-100 text-base text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-primary-500"
            placeholder="Search playlists..."
          />
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filtered.length === 0 && (
        <EmptyState
          icon={ListMusic}
          title="No playlists"
          description="Playlists are ordered sequences of content items with timing and transitions."
          action={
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Create Playlist
            </Button>
          }
        />
      )}

      {/* Table */}
      {!isLoading && filtered.length > 0 && (
        <div className="bryzos-card rounded-3xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-surface-50 border-b border-[var(--glass-border)]">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                  Items
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider hidden md:table-cell">
                  Last Updated
                </th>
                <th className="px-3 py-2 w-10" />
                <th className="px-3 py-2 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {filtered.map((playlist) => (
                <tr
                  key={playlist.id}
                  onClick={() => navigate(`/playlists/${playlist.id}`)}
                  className="hover:bg-surface-50 cursor-pointer transition-colors"
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded bg-surface-100 flex items-center justify-center shrink-0">
                        <ListMusic className="h-3.5 w-3.5 text-surface-400" />
                      </div>
                      <div>
                        <div className="text-base font-medium text-surface-900 truncate max-w-[220px]">
                          {playlist.name}
                        </div>
                        {playlist.description && (
                          <div className="text-xs text-surface-400 truncate max-w-[220px]">
                            {playlist.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-base text-surface-600">
                    {playlist.item_count} {playlist.item_count === 1 ? 'item' : 'items'}
                  </td>
                  <td className="px-3 py-2 text-base text-surface-500 hidden md:table-cell">
                    {formatDate(playlist.updated_at)}
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() =>
                        setDisplayTarget({ id: playlist.id, name: playlist.name })
                      }
                      className="h-7 w-7 inline-flex items-center justify-center rounded-xl text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-colors"
                      title="Display on device"
                    >
                      <Monitor className="h-3.5 w-3.5" />
                    </button>
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setDeleteTarget(playlist)}
                      className={clsx(
                        'h-7 w-7 inline-flex items-center justify-center rounded-xl',
                        'text-surface-400 hover:text-red-500 hover:bg-red-500/5 transition-colors'
                      )}
                      title="Delete playlist"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer count */}
      {!isLoading && filtered.length > 0 && (
        <div className="text-base text-surface-400">
          {filtered.length} of {playlists.length} playlist{playlists.length === 1 ? '' : 's'}
        </div>
      )}

      {/* Create dialog */}
      <CreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        siteId={activeSiteId}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['playlists', activeSiteId] });
        }}
      />

      {/* Delete dialog */}
      <DeleteDialog
        open={deleteTarget !== null}
        playlistName={deleteTarget?.name ?? ''}
        loading={deleteLoading}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Assign to device dialog */}
      <AssignToDeviceDialog
        open={displayTarget !== null}
        onClose={() => setDisplayTarget(null)}
        siteId={activeSiteId}
        playlistId={displayTarget?.id}
        playlistName={displayTarget?.name}
      />
    </div>
  );
}
