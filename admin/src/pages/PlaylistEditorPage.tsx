import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight,
  GripVertical,
  Plus,
  X,
  Trash2,
  Save,
  Film,
  Image,
  FileText,
  ListMusic,
} from 'lucide-react';
import clsx from 'clsx';
import { api } from '../lib/api';
import { useSiteStore } from '../stores/site';
import { useToastStore } from '../stores/toast';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import type { Playlist, PlaylistItem, Content } from '../lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TRANSITIONS: PlaylistItem['transition'][] = ['fade', 'slide-left', 'slide-right', 'dissolve', 'none'];

const TRANSITION_LABELS: Record<PlaylistItem['transition'], string> = {
  fade: 'Fade',
  'slide-left': 'Slide Left',
  'slide-right': 'Slide Right',
  dissolve: 'Dissolve',
  none: 'None',
};

function ContentIcon({ contentType }: { contentType: string }) {
  if (contentType === 'video') return <Film className="h-3.5 w-3.5" />;
  if (contentType === 'image') return <Image className="h-3.5 w-3.5" />;
  return <FileText className="h-3.5 w-3.5" />;
}

function ContentThumbnail({ item }: { item: PlaylistItem }) {
  if (item.content.type === 'image') {
    return (
      <img
        src={item.url}
        alt={item.content.name}
        className="h-10 w-14 rounded object-cover bg-surface-100"
        loading="lazy"
      />
    );
  }
  return (
    <div className="h-10 w-14 rounded bg-surface-100 flex items-center justify-center">
      <ContentIcon contentType={item.content.type} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Content Modal
// ---------------------------------------------------------------------------

interface AddContentModalProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
  playlistId: string;
  nextPosition: number;
  onSuccess: () => void;
}

function AddContentModal({
  open,
  onClose,
  siteId,
  playlistId,
  nextPosition,
  onSuccess,
}: AddContentModalProps) {
  const addToast = useToastStore((s) => s.addToast);
  const [addingId, setAddingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['content-for-playlist', siteId],
    queryFn: () =>
      api.get<{ items: Content[]; total: number }>(`/content?site_id=${siteId}&limit=100`),
    enabled: open && !!siteId,
  });

  const items = data?.items ?? [];

  const handleAdd = useCallback(
    async (content: Content) => {
      setAddingId(content.id);
      try {
        await api.post(`/playlists/${playlistId}/items`, {
          content_id: content.id,
          duration_sec: 10,
          transition: 'fade' as const,
          position: nextPosition,
        });
        addToast('success', `Added "${content.name}" to playlist`);
        onSuccess();
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'Failed to add content');
      } finally {
        setAddingId(null);
      }
    },
    [playlistId, nextPosition, addToast, onSuccess]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bryzos-card rounded-3xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--glass-border)] shrink-0">
          <h2 className="text-lg font-bold text-surface-900">Add Content</h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="h-7 w-7 inline-flex items-center justify-center rounded-xl text-surface-400 hover:text-surface-600 hover:bg-surface-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Spinner />
            </div>
          )}

          {!isLoading && items.length === 0 && (
            <div className="text-center py-12">
              <p className="text-base text-surface-500">No content available.</p>
            </div>
          )}

          {!isLoading && items.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {items.map((content) => {
                const isImage = content.type === 'image';
                const isAdding = addingId === content.id;

                return (
                  <button
                    key={content.id}
                    onClick={() => handleAdd(content)}
                    disabled={isAdding}
                    className={clsx(
                      'text-left border border-surface-200 rounded-xl overflow-hidden',
                      'hover:border-primary-300 hover:shadow-sm transition-all',
                      'disabled:opacity-50 disabled:pointer-events-none'
                    )}
                  >
                    <div className="aspect-video bg-surface-100 flex items-center justify-center overflow-hidden">
                      {isImage ? (
                        <img
                          src={content.url}
                          alt={content.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <ContentIcon contentType={content.type} />
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-lg font-bold text-surface-900 truncate">
                        {content.name}
                      </p>
                      <p className="text-sm text-surface-400">{content.type}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sortable Item Row
// ---------------------------------------------------------------------------

interface ItemRowProps {
  item: PlaylistItem;
  index: number;
  onDurationChange: (id: string, duration: number) => void;
  onTransitionChange: (id: string, transition: PlaylistItem['transition']) => void;
  onRemove: (id: string) => void;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  isDragTarget: boolean;
}

function ItemRow({
  item,
  index,
  onDurationChange,
  onTransitionChange,
  onRemove,
  onDragStart,
  onDragOver,
  onDragEnd,
  isDragTarget,
}: ItemRowProps) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragEnd={onDragEnd}
      className={clsx(
        'flex items-center gap-3 px-3 py-2 card-bg border-b border-surface-100 last:border-b-0',
        'transition-colors',
        isDragTarget && 'bg-primary-500/5 border-primary-500/20'
      )}
    >
      {/* Drag handle */}
      <div className="cursor-grab active:cursor-grabbing text-surface-300 hover:text-surface-500 shrink-0">
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Position */}
      <span className="text-xs font-medium text-surface-400 w-5 text-center shrink-0">
        {index + 1}
      </span>

      {/* Thumbnail */}
      <ContentThumbnail item={item} />

      {/* Name */}
      <div className="flex-1 min-w-0">
        <p className="text-base font-medium text-surface-900 truncate">
          {item.content.name}
        </p>
        <p className="text-sm text-surface-400">{item.content.type}</p>
      </div>

      {/* Duration */}
      <div className="shrink-0">
        <input
          type="number"
          min={1}
          max={3600}
          value={item.duration}
          onChange={(e) => onDurationChange(item.id, Number(e.target.value))}
          className="h-9 w-16 px-2 rounded-xl border border-surface-300 text-base text-surface-900 text-center focus:outline-none focus:ring-1 focus:ring-primary-500"
          title="Duration (seconds)"
        />
        <span className="text-sm text-surface-400 ml-1">sec</span>
      </div>

      {/* Transition */}
      <select
        value={item.transition}
        onChange={(e) =>
          onTransitionChange(item.id, e.target.value as PlaylistItem['transition'])
        }
        className="h-9 w-[90px] px-2 rounded-xl border border-surface-300 card-bg text-base text-surface-700 focus:outline-none focus:ring-1 focus:ring-primary-500 shrink-0"
      >
        {TRANSITIONS.map((t) => (
          <option key={t} value={t}>
            {TRANSITION_LABELS[t]}
          </option>
        ))}
      </select>

      {/* Remove */}
      <button
        onClick={() => onRemove(item.id)}
        className="h-7 w-7 inline-flex items-center justify-center rounded-xl text-surface-400 hover:text-red-600 hover:bg-red-500/5 transition-colors shrink-0"
        title="Remove item"
        aria-label="Remove item"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Editor Page
// ---------------------------------------------------------------------------

export function PlaylistEditorPage() {
  const { id } = useParams<{ id: string }>();
  const activeSiteId = useSiteStore((s) => s.activeSiteId);
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();

  const itemSaveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Clean up debounce timers on unmount
  useEffect(() => {
    return () => {
      itemSaveTimers.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const debouncedSaveItem = useCallback(
    (itemId: string, updates: { duration_sec?: number; transition?: string }) => {
      // Clear existing timer for this item
      const existing = itemSaveTimers.current.get(itemId);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(async () => {
        itemSaveTimers.current.delete(itemId);
        try {
          await api.put(`/playlists/${id}/items/${itemId}`, updates);
        } catch (err) {
          addToast('error', err instanceof Error ? err.message : 'Failed to save item');
          queryClient.invalidateQueries({ queryKey: ['playlist', id] });
        }
      }, 800);

      itemSaveTimers.current.set(itemId, timer);
    },
    [id, addToast, queryClient]
  );

  const [addContentOpen, setAddContentOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editLoop, setEditLoop] = useState(false);
  const [nameInitialized, setNameInitialized] = useState(false);
  const [localItems, setLocalItems] = useState<PlaylistItem[]>([]);
  const [itemsInitialized, setItemsInitialized] = useState(false);

  // Drag state
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Fetch playlist (items are embedded in the response)
  const { data: playlistData, isLoading: playlistLoading } = useQuery({
    queryKey: ['playlist', id],
    queryFn: () => api.get<Playlist & { items: PlaylistItem[] }>(`/playlists/${id}`),
    enabled: !!id,
  });

  const playlist: Playlist | undefined = playlistData;
  const items: PlaylistItem[] = playlistData?.items ?? [];
  const itemsLoading = false;

  // Initialize edit fields when playlist loads
  if (playlist && !nameInitialized) {
    setEditName(playlist.name);
    setEditDescription(playlist.description ?? '');
    setEditLoop(playlist.loop);
    setNameInitialized(true);
  }

  // Initialize local items when fetched
  if (items.length > 0 && !itemsInitialized) {
    setLocalItems(items);
    setItemsInitialized(true);
  }
  if (items.length === 0 && itemsInitialized && localItems.length > 0) {
    // items were cleared (all removed)
  }

  // Save playlist settings
  const saveMutation = useMutation({
    mutationFn: () =>
      api.put(`/playlists/${id}`, {
        name: editName,
        description: editDescription,
        loop: editLoop,
      }),
    onSuccess: () => {
      addToast('success', 'Playlist saved');
      queryClient.invalidateQueries({ queryKey: ['playlist', id] });
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
    },
    onError: (err: Error) => {
      addToast('error', err.message);
    },
  });

  // Remove item
  const handleRemoveItem = useCallback(
    async (itemId: string) => {
      try {
        await api.delete(`/playlists/${id}/items/${itemId}`);
        setLocalItems((prev) => prev.filter((i) => i.id !== itemId));
        addToast('success', 'Item removed');
        queryClient.invalidateQueries({ queryKey: ['playlist', id] });
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'Failed to remove item');
      }
    },
    [id, addToast, queryClient]
  );

  // Duration change — update local state + debounced API persist
  const handleDurationChange = useCallback((itemId: string, duration: number) => {
    setLocalItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, duration } : i))
    );
    debouncedSaveItem(itemId, { duration_sec: duration });
  }, [debouncedSaveItem]);

  // Transition change — update local state + debounced API persist
  const handleTransitionChange = useCallback(
    (itemId: string, transition: PlaylistItem['transition']) => {
      setLocalItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, transition } : i))
      );
      debouncedSaveItem(itemId, { transition });
    },
    [debouncedSaveItem]
  );

  // Drag-and-drop handlers
  const handleDragStart = useCallback((index: number) => {
    dragIndexRef.current = index;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  }, []);

  const handleDragEnd = useCallback(async () => {
    const from = dragIndexRef.current;
    const to = dragOverIndex;
    dragIndexRef.current = null;
    setDragOverIndex(null);

    if (from === null || to === null || from === to) return;

    // Reorder locally
    setLocalItems((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(from, 1);
      updated.splice(to, 0, moved);
      return updated.map((item, idx) => ({ ...item, position: idx }));
    });

    // Persist reorder
    try {
      const reordered = [...localItems];
      const [moved] = reordered.splice(from, 1);
      reordered.splice(to, 0, moved);

      await api.put(`/playlists/${id}/items/reorder`, {
        items: reordered.map((i, idx) => ({ id: i.id, position: idx })),
      });
      queryClient.invalidateQueries({ queryKey: ['playlist', id] });
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Reorder failed');
      // Refetch to restore server order
      queryClient.invalidateQueries({ queryKey: ['playlist', id] });
    }
  }, [dragOverIndex, localItems, id, addToast, queryClient]);

  const handleContentAdded = useCallback(() => {
    setItemsInitialized(false);
    queryClient.invalidateQueries({ queryKey: ['playlist', id] });
  }, [id, queryClient]);

  // Loading
  if (playlistLoading || itemsLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }

  // Not found
  if (!playlist) {
    return (
      <EmptyState
        icon={ListMusic}
        title="Playlist not found"
        description="The playlist you are looking for does not exist or was deleted."
        action={
          <Link to="/playlists">
            <Button variant="secondary" size="sm">
              Back to Playlists
            </Button>
          </Link>
        }
      />
    );
  }

  const displayItems = localItems.length > 0 ? localItems : items;

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-base">
        <Link
          to="/playlists"
          className="text-surface-500 hover:text-surface-700 transition-colors"
        >
          Playlists
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-surface-400" />
        <span className="text-surface-900 font-medium">{playlist.name}</span>
      </nav>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr,280px] gap-4">
        {/* Main column: Item List */}
        <div className="space-y-4">
          {/* Items header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-surface-900">
              Items ({displayItems.length})
            </h2>
            <Button size="sm" variant="secondary" onClick={() => setAddContentOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Add Content
            </Button>
          </div>

          {/* Items list */}
          {displayItems.length === 0 ? (
            <EmptyState
              icon={ListMusic}
              title="No items yet"
              description="Add content to this playlist to get started."
              action={
                <Button size="sm" onClick={() => setAddContentOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  Add Content
                </Button>
              }
            />
          ) : (
            <div className="bryzos-card rounded-3xl overflow-hidden">
              {/* Column headers */}
              <div className="flex items-center gap-3 px-3 py-1.5 bg-surface-50 border-b border-[var(--glass-border)] text-xs font-medium text-surface-500 uppercase tracking-wider">
                <span className="w-4" />
                <span className="w-5 text-center">#</span>
                <span className="w-14" />
                <span className="flex-1">Name</span>
                <span className="w-[88px] text-center">Duration</span>
                <span className="w-[90px]">Transition</span>
                <span className="w-7" />
              </div>

              {displayItems.map((item, index) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  index={index}
                  onDurationChange={handleDurationChange}
                  onTransitionChange={handleTransitionChange}
                  onRemove={handleRemoveItem}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                  isDragTarget={dragOverIndex === index}
                />
              ))}
            </div>
          )}
        </div>

        {/* Sidebar: Settings */}
        <div className="space-y-4">
          <div className="bryzos-card rounded-3xl">
            <div className="px-4 py-3 border-b border-[var(--glass-border)]">
              <h3 className="text-xs font-medium text-surface-500 uppercase">Settings</h3>
            </div>
            <div className="p-4 space-y-5">
              {/* Name */}
              <div>
                <label className="block text-sm font-semibold text-surface-600 mb-1.5">
                  Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-10 w-full px-3 rounded-xl border border-surface-300 text-base text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-surface-600 mb-1.5">
                  Description
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Optional description"
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border border-surface-300 text-base text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
                />
              </div>

              {/* Loop toggle */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-surface-600">
                  Loop playlist
                </label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={editLoop}
                  onClick={() => setEditLoop((prev) => !prev)}
                  className={clsx(
                    'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
                    editLoop ? 'bg-primary-600' : 'bg-surface-200'
                  )}
                >
                  <span
                    className={clsx(
                      'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform ring-0 transition-transform',
                      editLoop ? 'translate-x-4' : 'translate-x-0'
                    )}
                  />
                </button>
              </div>

              {/* Save button */}
              <Button
                size="sm"
                className="w-full"
                onClick={() => saveMutation.mutate()}
                loading={saveMutation.isPending}
                disabled={!editName.trim()}
              >
                <Save className="h-3.5 w-3.5" />
                Save Settings
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Add content modal */}
      {activeSiteId && (
        <AddContentModal
          open={addContentOpen}
          onClose={() => setAddContentOpen(false)}
          siteId={activeSiteId}
          playlistId={id ?? ''}
          nextPosition={displayItems.length}
          onSuccess={handleContentAdded}
        />
      )}
    </div>
  );
}
