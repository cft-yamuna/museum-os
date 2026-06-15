import { useState, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight,
  CalendarRange,
  Save,
  Play,
  Pause,
  Plus,
  Trash2,
  Search,
  Monitor,
} from 'lucide-react';
import clsx from 'clsx';
import { api } from '../lib/api';
import { useSiteStore } from '../stores/site';
import { useToastStore } from '../stores/toast';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import type {
  Exhibition,
  ExhibitionAssignment,
  Device,
  Content,
  Playlist,
} from '../lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ExhibitionStatus = 'active' | 'upcoming' | 'expired' | 'inactive';

function getExhibitionStatus(exhibition: Exhibition): ExhibitionStatus {
  const now = new Date();
  const start = new Date(exhibition.start_date);
  const end = new Date(exhibition.end_date);

  if (!exhibition.is_active) return 'inactive';
  if (now < start) return 'upcoming';
  if (now > end) return 'expired';
  return 'active';
}

const STATUS_BADGE: Record<
  ExhibitionStatus,
  { variant: 'success' | 'info' | 'neutral' | 'warning'; label: string }
> = {
  active: { variant: 'success', label: 'Active' },
  upcoming: { variant: 'info', label: 'Upcoming' },
  expired: { variant: 'neutral', label: 'Expired' },
  inactive: { variant: 'warning', label: 'Inactive' },
};

const DEVICE_STATUS_DOT: Record<Device['status'], string> = {
  online: 'bg-emerald-400',
  error: 'bg-red-400',
  offline: 'bg-surface-300',
  unavailable: 'bg-surface-300',
  restarting: 'bg-blue-400',
};

// Format YYYY-MM-DD for date inputs
function toDateInputValue(iso: string): string {
  return iso.split('T')[0];
}

// ---------------------------------------------------------------------------
// Assignment Row
// ---------------------------------------------------------------------------

interface AssignmentRowProps {
  assignment: ExhibitionAssignment;
  contentItems: Content[];
  playlists: Playlist[];
  onContentChange: (assignmentId: string, contentId: string | null, playlistId: string | null) => void;
  onRemove: (assignmentId: string) => void;
}

function AssignmentRow({
  assignment,
  contentItems,
  playlists,
  onContentChange,
  onRemove,
}: AssignmentRowProps) {
  const currentValue = assignment.content
    ? `content:${assignment.content.id}`
    : assignment.playlist
    ? `playlist:${assignment.playlist.id}`
    : '';

  const handleChange = (value: string) => {
    if (!value) {
      onContentChange(assignment.id, null, null);
      return;
    }
    const [type, id] = value.split(':');
    if (type === 'content') {
      onContentChange(assignment.id, id, null);
    } else {
      onContentChange(assignment.id, null, id);
    }
  };

  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b border-surface-100 last:border-b-0">
      {/* Device info */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span
          className={clsx(
            'h-2 w-2 rounded-full shrink-0',
            DEVICE_STATUS_DOT[assignment.device.status]
          )}
        />
        <div className="min-w-0">
          <p className="text-base font-medium text-surface-900 truncate">
            {assignment.device.name}
          </p>
          <p className="text-sm text-surface-400">{assignment.device.type}</p>
        </div>
      </div>

      {/* Content/Playlist selector */}
      <select
        value={currentValue}
        onChange={(e) => handleChange(e.target.value)}
        className="h-9 w-[200px] px-2 rounded-xl border border-surface-300 card-bg text-base text-surface-700 focus:outline-none focus:ring-1 focus:ring-primary-500 shrink-0"
      >
        <option value="">-- None --</option>
        {contentItems.length > 0 && (
          <optgroup label="Content">
            {contentItems.map((c) => (
              <option key={c.id} value={`content:${c.id}`}>
                {c.name}
              </option>
            ))}
          </optgroup>
        )}
        {playlists.length > 0 && (
          <optgroup label="Playlists">
            {playlists.map((p) => (
              <option key={p.id} value={`playlist:${p.id}`}>
                {p.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>

      {/* Remove */}
      <button
        onClick={() => onRemove(assignment.id)}
        className="h-7 w-7 inline-flex items-center justify-center rounded-xl text-surface-400 hover:text-red-600 hover:bg-red-500/5 transition-colors shrink-0"
        title="Remove assignment"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Editor Page
// ---------------------------------------------------------------------------

export function ExhibitionEditorPage() {
  const { id } = useParams<{ id: string }>();
  const activeSiteId = useSiteStore((s) => s.activeSiteId);
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();

  // Form state
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [formInitialized, setFormInitialized] = useState(false);

  // Device selection state
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Set<string>>(new Set());
  const [deviceSearch, setDeviceSearch] = useState('');
  const [deviceTypeFilter, setDeviceTypeFilter] = useState('');

  // Fetch exhibition (assignments are embedded in the response)
  const { data: exhibitionData, isLoading: exhibitionLoading } = useQuery({
    queryKey: ['exhibition', id],
    queryFn: () => api.get<Exhibition & { assignments: ExhibitionAssignment[] }>(`/exhibitions/${id}`),
    enabled: !!id,
  });

  const exhibition: Exhibition | undefined = exhibitionData;
  const assignments: ExhibitionAssignment[] = exhibitionData?.assignments ?? [];
  const assignmentsLoading = false;

  // Initialize form when data arrives
  if (exhibition && !formInitialized) {
    setEditName(exhibition.name);
    setEditDescription(exhibition.description ?? '');
    setEditStartDate(toDateInputValue(exhibition.start_date));
    setEditEndDate(toDateInputValue(exhibition.end_date));
    setFormInitialized(true);
  }

  // Fetch available devices
  const { data: allDevices = [] } = useQuery({
    queryKey: ['devices', activeSiteId],
    queryFn: () => api.get<Device[]>(`/devices?site_id=${activeSiteId}`),
    enabled: !!activeSiteId,
  });

  // Fetch content & playlists for assignment dropdowns
  const { data: contentData } = useQuery({
    queryKey: ['content-for-exhibition', activeSiteId],
    queryFn: () =>
      api.get<{ items: Content[]; total: number }>(`/content?site_id=${activeSiteId}&limit=100`),
    enabled: !!activeSiteId,
  });

  const { data: playlists = [] } = useQuery({
    queryKey: ['playlists', activeSiteId],
    queryFn: () => api.get<Playlist[]>(`/playlists?site_id=${activeSiteId}`),
    enabled: !!activeSiteId,
  });

  const contentItems = contentData?.items ?? [];

  // Compute assigned device IDs
  const assignedDeviceIds = useMemo(
    () => new Set(assignments.map((a) => a.deviceId)),
    [assignments]
  );

  // Derive device types for filter
  const deviceTypes = useMemo(() => {
    const types = new Set(allDevices.map((d) => d.type));
    return Array.from(types).sort();
  }, [allDevices]);

  // Available (unassigned) devices, filtered
  const availableDevices = useMemo(() => {
    return allDevices.filter((d) => {
      if (assignedDeviceIds.has(d.id)) return false;
      if (deviceSearch && !d.display_name.toLowerCase().includes(deviceSearch.toLowerCase())) return false;
      if (deviceTypeFilter && d.type !== deviceTypeFilter) return false;
      return true;
    });
  }, [allDevices, assignedDeviceIds, deviceSearch, deviceTypeFilter]);

  // Save settings
  const saveMutation = useMutation({
    mutationFn: () =>
      api.put(`/exhibitions/${id}`, {
        name: editName,
        description: editDescription,
        start_date: editStartDate,
        end_date: editEndDate,
      }),
    onSuccess: () => {
      addToast('success', 'Exhibition saved');
      queryClient.invalidateQueries({ queryKey: ['exhibition', id] });
      queryClient.invalidateQueries({ queryKey: ['exhibitions'] });
    },
    onError: (err: Error) => {
      addToast('error', err.message);
    },
  });

  // Activate / Deactivate
  const activateMutation = useMutation({
    mutationFn: () => api.post(`/exhibitions/${id}/activate`),
    onSuccess: () => {
      addToast('success', 'Exhibition activated');
      queryClient.invalidateQueries({ queryKey: ['exhibition', id] });
      queryClient.invalidateQueries({ queryKey: ['exhibitions'] });
    },
    onError: (err: Error) => {
      addToast('error', err.message);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: () => api.post(`/exhibitions/${id}/deactivate`),
    onSuccess: () => {
      addToast('success', 'Exhibition deactivated');
      queryClient.invalidateQueries({ queryKey: ['exhibition', id] });
      queryClient.invalidateQueries({ queryKey: ['exhibitions'] });
    },
    onError: (err: Error) => {
      addToast('error', err.message);
    },
  });

  // Assign selected devices
  const handleAssign = useCallback(async () => {
    if (selectedDeviceIds.size === 0) return;
    const ids = Array.from(selectedDeviceIds);

    try {
      await Promise.all(
        ids.map((deviceId) =>
          api.post(`/exhibitions/${id}/assignments`, {
            device_id: deviceId,
            content_id: null,
            playlist_id: null,
          })
        )
      );
      addToast('success', `${ids.length} device(s) assigned`);
      setSelectedDeviceIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['exhibition', id] });
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to assign devices');
    }
  }, [selectedDeviceIds, id, addToast, queryClient]);

  // Remove assignment
  const handleRemoveAssignment = useCallback(
    async (assignmentId: string) => {
      try {
        await api.delete(`/exhibitions/${id}/assignments/${assignmentId}`);
        addToast('success', 'Assignment removed');
        queryClient.invalidateQueries({ queryKey: ['exhibition', id] });
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'Failed to remove assignment');
      }
    },
    [id, addToast, queryClient]
  );

  // Update assignment content (fire-and-forget, update locally then sync)
  const handleContentChange = useCallback(
    async (_assignmentId: string, contentId: string | null, playlistId: string | null) => {
      // Note: In a production app this would call a PUT /assignments/:id endpoint.
      // For now the assignment already tracks content_id/playlist_id via the POST.
      // This is a local UX placeholder until the backend supports PUT on assignments.
      try {
        await api.put(`/exhibitions/${id}/assignments/${_assignmentId}`, {
          content_id: contentId,
          playlist_id: playlistId,
        });
        queryClient.invalidateQueries({ queryKey: ['exhibition', id] });
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'Failed to update assignment');
      }
    },
    [id, addToast, queryClient]
  );

  // Toggle device selection
  const toggleDeviceSelection = useCallback((deviceId: string) => {
    setSelectedDeviceIds((prev) => {
      const next = new Set(prev);
      if (next.has(deviceId)) {
        next.delete(deviceId);
      } else {
        next.add(deviceId);
      }
      return next;
    });
  }, []);

  // Loading
  if (exhibitionLoading || assignmentsLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }

  // Not found
  if (!exhibition) {
    return (
      <EmptyState
        icon={CalendarRange}
        title="Exhibition not found"
        description="The exhibition you are looking for does not exist or was deleted."
        action={
          <Link to="/exhibitions">
            <Button variant="secondary" size="sm">
              Back to Exhibitions
            </Button>
          </Link>
        }
      />
    );
  }

  const status = getExhibitionStatus(exhibition);
  const statusCfg = STATUS_BADGE[status];

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-base">
        <Link
          to="/exhibitions"
          className="text-surface-500 hover:text-surface-700 transition-colors"
        >
          Exhibitions
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-surface-400" />
        <span className="text-surface-900 font-medium">{exhibition.name}</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-surface-900 leading-tight">{exhibition.name}</h1>
          <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {exhibition.is_active ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => deactivateMutation.mutate()}
              loading={deactivateMutation.isPending}
            >
              <Pause className="h-3.5 w-3.5" />
              Deactivate
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => activateMutation.mutate()}
              loading={activateMutation.isPending}
            >
              <Play className="h-3.5 w-3.5" />
              Activate
            </Button>
          )}
        </div>
      </div>

      {/* Two-column: Settings + Assignment Builder */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px,1fr] gap-4">
        {/* Left: Settings */}
        <div className="bryzos-card rounded-3xl">
          <div className="px-4 py-3 border-b border-[var(--glass-border)]">
            <h3 className="text-xs font-medium text-surface-500 uppercase">Settings</h3>
          </div>
          <div className="p-4 space-y-5">
            {/* Name */}
            <div>
              <label className="block text-sm font-semibold text-surface-600 mb-1.5">Name</label>
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

            {/* Start date */}
            <div>
              <label className="block text-sm font-semibold text-surface-600 mb-1.5">
                Start Date
              </label>
              <input
                type="date"
                value={editStartDate}
                onChange={(e) => setEditStartDate(e.target.value)}
                className="h-10 w-full px-3 rounded-xl border border-surface-300 text-base text-surface-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            {/* End date */}
            <div>
              <label className="block text-sm font-semibold text-surface-600 mb-1.5">
                End Date
              </label>
              <input
                type="date"
                value={editEndDate}
                onChange={(e) => setEditEndDate(e.target.value)}
                className="h-10 w-full px-3 rounded-xl border border-surface-300 text-base text-surface-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            {/* Save */}
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

        {/* Right: Assignment Builder */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-surface-900">Device Assignments</h2>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* Available devices panel */}
            <div className="bryzos-card rounded-3xl flex flex-col max-h-[500px]">
              <div className="px-3 py-2 border-b border-[var(--glass-border)] shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-surface-500 uppercase">
                    Available Devices
                  </span>
                  <span className="text-sm text-surface-400">
                    {availableDevices.length} device{availableDevices.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-surface-400" />
                    <input
                      type="text"
                      value={deviceSearch}
                      onChange={(e) => setDeviceSearch(e.target.value)}
                      placeholder="Search..."
                      className="h-9 w-full pl-7 pr-2 rounded-xl border border-surface-300 text-sm text-surface-700 placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <select
                    value={deviceTypeFilter}
                    onChange={(e) => setDeviceTypeFilter(e.target.value)}
                    className="h-9 px-2 rounded-xl border border-surface-300 card-bg text-sm text-surface-600 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="">All types</option>
                    {deviceTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {availableDevices.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <p className="text-base text-surface-400">No devices available</p>
                  </div>
                ) : (
                  <div className="divide-y divide-surface-100">
                    {availableDevices.map((device) => (
                      <label
                        key={device.id}
                        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-surface-50 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedDeviceIds.has(device.id)}
                          onChange={() => toggleDeviceSelection(device.id)}
                          className="h-3.5 w-3.5 rounded border-surface-300"
                        />
                        <span
                          className={clsx(
                            'h-2 w-2 rounded-full shrink-0',
                            DEVICE_STATUS_DOT[device.status]
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-base text-surface-900 truncate">{device.display_name}</p>
                          <p className="text-sm text-surface-400">{device.type}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Assign button */}
              <div className="px-3 py-2 border-t border-[var(--glass-border)] shrink-0">
                <Button
                  size="sm"
                  className="w-full"
                  disabled={selectedDeviceIds.size === 0}
                  onClick={handleAssign}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Assign {selectedDeviceIds.size > 0 ? `(${selectedDeviceIds.size})` : ''}
                </Button>
              </div>
            </div>

            {/* Assigned devices panel */}
            <div className="bryzos-card rounded-3xl flex flex-col max-h-[500px]">
              <div className="px-3 py-2 border-b border-[var(--glass-border)] shrink-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-surface-500 uppercase">
                    Assigned Devices
                  </span>
                  <span className="text-sm text-surface-400">
                    {assignments.length} assigned
                  </span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {assignments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 px-4">
                    <Monitor className="h-6 w-6 text-surface-300 mb-2" />
                    <p className="text-base text-surface-400 text-center">
                      No devices assigned yet. Select devices from the left panel.
                    </p>
                  </div>
                ) : (
                  assignments.map((assignment) => (
                    <AssignmentRow
                      key={assignment.id}
                      assignment={assignment}
                      contentItems={contentItems}
                      playlists={playlists}
                      onContentChange={handleContentChange}
                      onRemove={handleRemoveAssignment}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
