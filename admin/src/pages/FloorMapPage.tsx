import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { useSiteStore } from '../stores/site';
import { useToastStore } from '../stores/toast';
import { api } from '../lib/api';
import { adminWs } from '../lib/ws';
import { Spinner } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import type { Device } from '../lib/types';
import {
  Map as MapIcon,
  Pencil,
  Eye,
  Save,
  ChevronDown,
  Monitor,
  Power,
  PowerOff,
  ExternalLink,
  GripVertical,
  X,
  Plus,
  Trash2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Floor {
  id: string;
  site_id: string;
  name: string;
  level: number;
  background_image: string | null;
}

/** Local drag state for a single device. */
interface DragState {
  deviceId: string;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
}

/** Pending position change before save. */
interface PositionChange {
  x_position: number;
  y_position: number;
}

// ---------------------------------------------------------------------------
// Status colors
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<
  Device['status'],
  { bg: string; ring: string; pulse: boolean; label: string }
> = {
  online: { bg: 'bg-emerald-500', ring: 'ring-emerald-200', pulse: true, label: 'Online' },
  error: { bg: 'bg-red-500', ring: 'ring-red-200', pulse: false, label: 'Error' },
  offline: { bg: 'bg-surface-400', ring: 'ring-surface-200', pulse: false, label: 'Offline' },
  unavailable: { bg: 'bg-surface-400', ring: 'ring-surface-200', pulse: false, label: 'Unavailable' },
  restarting: { bg: 'bg-blue-500', ring: 'ring-blue-200', pulse: true, label: 'Restarting' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDevicePosition(
  device: Device,
  pendingChanges: Map<string, PositionChange>,
): { x: number; y: number } | null {
  const pending = pendingChanges.get(device.id);
  if (pending) {
    return { x: pending.x_position, y: pending.y_position };
  }
  if (device.x_position != null && device.y_position != null) {
    return { x: device.x_position, y: device.y_position };
  }
  return null;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DeviceMarker({
  device,
  position,
  isEditMode,
  isSelected,
  onMouseDown,
  onClick,
}: {
  device: Device;
  position: { x: number; y: number };
  isEditMode: boolean;
  isSelected: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onClick: (e: React.MouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const colors = STATUS_COLORS[device.status];

  return (
    <div
      className="absolute z-10 -translate-x-1/2 -translate-y-1/2 group"
      style={{ left: `${position.x}%`, top: `${position.y}%` }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={isEditMode ? onMouseDown : undefined}
      onClick={!isEditMode ? onClick : undefined}
    >
      {/* Outer ring */}
      <div
        className={clsx(
          'relative flex items-center justify-center h-6 w-6 rounded-full ring-2 transition-shadow',
          colors.bg,
          colors.ring,
          isEditMode && 'cursor-grab active:cursor-grabbing',
          !isEditMode && 'cursor-pointer',
          isSelected && 'ring-primary-400 ring-[3px]',
        )}
      >
        {/* Pulse animation for online */}
        {colors.pulse && (
          <span
            className={clsx(
              'absolute inset-0 rounded-full animate-ping opacity-40',
              colors.bg,
            )}
          />
        )}
        <Monitor className="h-3 w-3 text-white relative z-[1]" />
      </div>

      {/* Hover tooltip */}
      {hovered && !isEditMode && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-44 bg-surface-900 text-white rounded-xl shadow-lg p-2 pointer-events-none z-30">
          <div className="text-sm font-medium truncate">{device.display_name}</div>
          <div className="text-[10px] text-surface-300 mt-0.5">
            {device.type} &middot; {colors.label}
          </div>
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-surface-900" />
        </div>
      )}

      {/* Coordinate tooltip while in edit mode */}
      {isEditMode && hovered && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-surface-800 text-white rounded px-1.5 py-0.5 text-[10px] font-mono whitespace-nowrap pointer-events-none z-30">
          {position.x.toFixed(1)}%, {position.y.toFixed(1)}%
        </div>
      )}
    </div>
  );
}

function DevicePopup({
  device,
  onClose,
  onNavigate,
  onPower,
  powerLoading,
}: {
  device: Device;
  onClose: () => void;
  onNavigate: () => void;
  onPower: (action: 'power_on' | 'power_off') => void;
  powerLoading: boolean;
}) {
  const colors = STATUS_COLORS[device.status];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20" />
      {/* Card */}
      <div
        className="relative bryzos-card rounded-3xl shadow-lg w-72 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2.5 border-b border-[var(--glass-border)] flex items-center justify-between">
          <span className="text-base font-medium text-surface-900 truncate pr-2">
            {device.display_name}
          </span>
          <button
            onClick={onClose}
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-surface-100 text-surface-400 hover:text-surface-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-xs text-surface-400">Status</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={clsx('h-2 w-2 rounded-full', colors.bg)} />
                <span className="text-base text-surface-700">{colors.label}</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-surface-400">Type</div>
              <div className="text-base text-surface-700 mt-0.5">{device.type}</div>
            </div>
          </div>
          <div className="pt-2 border-t border-surface-100 flex items-center gap-1.5">
            <button
              onClick={onNavigate}
              className="h-9 flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-surface-300 text-base text-surface-700 hover:bg-surface-50"
            >
              <ExternalLink className="h-3 w-3" />
              Details
            </button>
            <button
              onClick={() => onPower('power_on')}
              disabled={powerLoading}
              className="h-9 px-3.5 inline-flex items-center gap-1 rounded-xl border border-surface-300 text-base text-surface-700 hover:bg-surface-50 disabled:opacity-50"
            >
              <Power className="h-3 w-3 text-emerald-500" />
            </button>
            <button
              onClick={() => onPower('power_off')}
              disabled={powerLoading}
              className="h-9 px-3.5 inline-flex items-center gap-1 rounded-xl border border-surface-300 text-base text-surface-700 hover:bg-surface-50 disabled:opacity-50"
            >
              <PowerOff className="h-3 w-3 text-red-500" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function UnplacedDeviceRow({
  device,
  isEditMode,
  onDragStart,
}: {
  device: Device;
  isEditMode: boolean;
  onDragStart: (e: React.MouseEvent) => void;
}) {
  const colors = STATUS_COLORS[device.status];

  return (
    <div
      className={clsx(
        'flex items-center gap-2 px-3 py-2 border-b border-surface-100 last:border-b-0',
        isEditMode && 'cursor-grab active:cursor-grabbing hover:bg-surface-50',
      )}
      onMouseDown={isEditMode ? onDragStart : undefined}
    >
      {isEditMode && (
        <GripVertical className="h-3.5 w-3.5 text-surface-300 flex-shrink-0" />
      )}
      <span className={clsx('h-2 w-2 rounded-full flex-shrink-0', colors.bg)} />
      <span className="text-base text-surface-700 truncate flex-1">{device.display_name}</span>
      <span className="text-sm text-surface-400 flex-shrink-0">{device.type}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Floor CRUD dialogs
// ---------------------------------------------------------------------------

function FloorDialog({
  open,
  floor,
  onClose,
  onSubmit,
  loading,
}: {
  open: boolean;
  floor: Floor | null;
  onClose: () => void;
  onSubmit: (data: { name: string; level: number; background_image: string }) => void;
  loading: boolean;
}) {
  const [name, setName] = useState('');
  const [level, setLevel] = useState('0');
  const [bgImage, setBgImage] = useState('');

  useEffect(() => {
    if (open) {
      setName(floor ? floor.name : '');
      setLevel(floor ? String(floor.level) : '0');
      setBgImage(floor ? floor.background_image || '' : '');
    }
  }, [open, floor]);

  if (!open) return null;

  const isEdit = floor !== null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit({
      name: trimmed,
      level: parseInt(level, 10) || 0,
      background_image: bgImage.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bryzos-card rounded-3xl shadow-xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--glass-border)]">
          <span className="text-lg font-bold text-surface-900">
            {isEdit ? 'Edit Floor' : 'Add Floor'}
          </span>
          <button
            onClick={onClose}
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-surface-100 text-surface-400 hover:text-surface-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-4 space-y-5">
            <div>
              <label className="block text-sm font-semibold text-surface-600 mb-1.5">
                Floor Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
                placeholder="e.g. Ground Floor"
                className="h-10 w-full px-3.5 rounded-xl border border-surface-300 card-bg text-base text-surface-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-surface-600 mb-1.5">
                Level <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                required
                placeholder="0"
                className="h-10 w-full px-3.5 rounded-xl border border-surface-300 card-bg text-base text-surface-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-surface-600 mb-1.5">
                Background Image URL
              </label>
              <input
                type="text"
                value={bgImage}
                onChange={(e) => setBgImage(e.target.value)}
                placeholder="Optional — e.g. floors/ground.png"
                className="h-10 w-full px-3.5 rounded-xl border border-surface-300 card-bg text-base text-surface-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--glass-border)]">
            <Button size="sm" variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" type="submit" loading={loading} disabled={!name.trim()}>
              {isEdit ? 'Save Changes' : 'Create Floor'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteFloorDialog({
  floor,
  onClose,
  onConfirm,
  loading,
}: {
  floor: Floor | null;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  if (!floor) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bryzos-card rounded-3xl shadow-xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--glass-border)]">
          <span className="text-lg font-bold text-surface-900">Delete Floor</span>
          <button
            onClick={onClose}
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-surface-100 text-surface-400 hover:text-surface-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="p-4">
          <p className="text-base text-surface-700">
            Are you sure you want to delete floor &lsquo;{floor.name}&rsquo;? All device
            positions on this floor will be lost.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--glass-border)]">
          <Button size="sm" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" variant="danger" onClick={onConfirm} loading={loading}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function FloorMapPage() {
  const navigate = useNavigate();
  const activeSiteId = useSiteStore((s) => s.activeSiteId);
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();

  // UI state
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [pendingChanges, setPendingChanges] = useState<Map<string, PositionChange>>(new Map());
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [powerLoadingId, setPowerLoadingId] = useState<string | null>(null);

  // Floor CRUD state
  const [floorDialogOpen, setFloorDialogOpen] = useState(false);
  const [editingFloor, setEditingFloor] = useState<Floor | null>(null);
  const [deleteFloorTarget, setDeleteFloorTarget] = useState<Floor | null>(null);

  // For unplaced device drag-onto-map
  const [unplacedDrag, setUnplacedDrag] = useState<{
    deviceId: string;
    startX: number;
    startY: number;
  } | null>(null);

  const mapRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  const { data: floors = [], isLoading: floorsLoading } = useQuery({
    queryKey: ['floors', activeSiteId],
    queryFn: () => api.get<Floor[]>(`/floors?site_id=${activeSiteId}`),
    enabled: !!activeSiteId,
  });

  // Auto-select first floor when floors load
  useEffect(() => {
    if (floors.length > 0 && !selectedFloorId) {
      setSelectedFloorId(floors[0].id);
    }
  }, [floors, selectedFloorId]);

  const { data: rawDevices = [], isLoading: devicesLoading } = useQuery({
    queryKey: ['devices', activeSiteId, selectedFloorId],
    queryFn: () =>
      api.get<Device[]>(
        `/devices?site_id=${activeSiteId}&floor_id=${selectedFloorId}`,
      ),
    enabled: !!activeSiteId && !!selectedFloorId,
  });

  // Also fetch unplaced devices (on this floor, no position — OR devices with no floor)
  useQuery({
    queryKey: ['devices', activeSiteId],
    queryFn: () => api.get<Device[]>(`/devices?site_id=${activeSiteId}`),
    enabled: !!activeSiteId,
  });

  // ---------------------------------------------------------------------------
  // Real-time status
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const unsub = adminWs.on('device:status', (_event, data) => {
      const update = data as {
        device_id: string;
        status: Device['status'];
        last_seen?: string;
      };

      // Update floor-specific query
      queryClient.setQueryData<Device[]>(
        ['devices', activeSiteId, selectedFloorId],
        (old) => {
          if (!old) return old;
          return old.map((d) =>
            d.id === update.device_id
              ? {
                  ...d,
                  status: update.status,
                  last_seen: update.last_seen || d.last_seen,
                }
              : d,
          );
        },
      );

      // Update all-devices query
      queryClient.setQueryData<Device[]>(
        ['devices', activeSiteId],
        (old) => {
          if (!old) return old;
          return old.map((d) =>
            d.id === update.device_id
              ? {
                  ...d,
                  status: update.status,
                  last_seen: update.last_seen || d.last_seen,
                }
              : d,
          );
        },
      );
    });
    return unsub;
  }, [activeSiteId, selectedFloorId, queryClient]);

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const selectedFloor = useMemo(
    () => floors.find((f) => f.id === selectedFloorId) || null,
    [floors, selectedFloorId],
  );

  const placedDevices = useMemo(() => {
    return rawDevices.filter((d) => {
      const pos = getDevicePosition(d, pendingChanges);
      return pos !== null;
    });
  }, [rawDevices, pendingChanges]);

  const unplacedDevices = useMemo(() => {
    // Devices on this floor with no position, plus devices assigned to this floor
    // that gained a pending position are excluded
    return rawDevices.filter((d) => {
      const pos = getDevicePosition(d, pendingChanges);
      return pos === null;
    });
  }, [rawDevices, pendingChanges]);

  // ---------------------------------------------------------------------------
  // Drag handlers — placed device repositioning
  // ---------------------------------------------------------------------------

  const handleMarkerMouseDown = useCallback(
    (deviceId: string) => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!mapRef.current) return;

      const rect = mapRef.current.getBoundingClientRect();
      const xPct = ((e.clientX - rect.left) / rect.width) * 100;
      const yPct = ((e.clientY - rect.top) / rect.height) * 100;

      setDragState({
        deviceId,
        startX: e.clientX,
        startY: e.clientY,
        offsetX: xPct,
        offsetY: yPct,
      });
    },
    [],
  );

  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!mapRef.current) return;
      const rect = mapRef.current.getBoundingClientRect();
      const xPct = clampPercent(((e.clientX - rect.left) / rect.width) * 100);
      const yPct = clampPercent(((e.clientY - rect.top) / rect.height) * 100);

      setPendingChanges((prev) => {
        const next = new Map(prev);
        next.set(dragState.deviceId, { x_position: xPct, y_position: yPct });
        return next;
      });
    };

    const handleMouseUp = () => {
      setDragState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState]);

  // ---------------------------------------------------------------------------
  // Drag handlers — unplaced device onto map
  // ---------------------------------------------------------------------------

  const handleUnplacedDragStart = useCallback(
    (deviceId: string) => (e: React.MouseEvent) => {
      e.preventDefault();
      setUnplacedDrag({
        deviceId,
        startX: e.clientX,
        startY: e.clientY,
      });
    },
    [],
  );

  useEffect(() => {
    if (!unplacedDrag) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!mapRef.current) return;
      const rect = mapRef.current.getBoundingClientRect();
      const xPct = clampPercent(((e.clientX - rect.left) / rect.width) * 100);
      const yPct = clampPercent(((e.clientY - rect.top) / rect.height) * 100);

      // Only add a pending change if dragged onto the map area
      const isOverMap =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      if (isOverMap) {
        setPendingChanges((prev) => {
          const next = new Map(prev);
          next.set(unplacedDrag.deviceId, {
            x_position: xPct,
            y_position: yPct,
          });
          return next;
        });
      }
    };

    const handleMouseUp = () => {
      setUnplacedDrag(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [unplacedDrag]);

  // ---------------------------------------------------------------------------
  // Save mutation
  // ---------------------------------------------------------------------------

  const saveMutation = useMutation({
    mutationFn: async () => {
      const entries = Array.from(pendingChanges.entries());
      if (entries.length === 0) {
        throw new Error('No position changes to save');
      }
      await Promise.all(
        entries.map(([deviceId, pos]) =>
          api.put(`/devices/${deviceId}`, {
            x_position: pos.x_position,
            y_position: pos.y_position,
            floor_id: selectedFloorId,
          }),
        ),
      );
      return entries.length;
    },
    onSuccess: (count) => {
      addToast('success', `Saved positions for ${count} device(s)`);
      setPendingChanges(new Map());
      queryClient.invalidateQueries({
        queryKey: ['devices', activeSiteId, selectedFloorId],
      });
      queryClient.invalidateQueries({
        queryKey: ['devices', activeSiteId],
      });
    },
    onError: (err) => {
      addToast('error', err instanceof Error ? err.message : 'Failed to save positions');
    },
  });

  // ---------------------------------------------------------------------------
  // Floor CRUD mutations
  // ---------------------------------------------------------------------------

  const createFloorMutation = useMutation({
    mutationFn: (data: { name: string; level: number; background_image: string }) =>
      api.post<Floor>('/floors', {
        site_id: activeSiteId,
        name: data.name,
        level: data.level,
        background_image: data.background_image || null,
      }),
    onSuccess: (newFloor) => {
      addToast('success', `Floor "${newFloor.name}" created`);
      setFloorDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['floors', activeSiteId] });
      setSelectedFloorId(newFloor.id);
    },
    onError: (err) => {
      addToast('error', err instanceof Error ? err.message : 'Failed to create floor');
    },
  });

  const updateFloorMutation = useMutation({
    mutationFn: (data: { id: string; name: string; level: number; background_image: string }) =>
      api.put<Floor>(`/floors/${data.id}`, {
        name: data.name,
        level: data.level,
        background_image: data.background_image || null,
      }),
    onSuccess: (updatedFloor) => {
      addToast('success', `Floor "${updatedFloor.name}" updated`);
      setFloorDialogOpen(false);
      setEditingFloor(null);
      queryClient.invalidateQueries({ queryKey: ['floors', activeSiteId] });
    },
    onError: (err) => {
      addToast('error', err instanceof Error ? err.message : 'Failed to update floor');
    },
  });

  const deleteFloorMutation = useMutation({
    mutationFn: (floorId: string) => api.delete(`/floors/${floorId}`),
    onSuccess: () => {
      const deleted = deleteFloorTarget;
      addToast('success', `Floor "${deleted?.name}" deleted`);
      setDeleteFloorTarget(null);
      queryClient.invalidateQueries({ queryKey: ['floors', activeSiteId] });
      // Select first remaining floor
      if (selectedFloorId === deleted?.id) {
        const remaining = floors.filter((f) => f.id !== deleted?.id);
        setSelectedFloorId(remaining.length > 0 ? remaining[0].id : null);
      }
    },
    onError: (err) => {
      addToast('error', err instanceof Error ? err.message : 'Failed to delete floor');
    },
  });

  // ---------------------------------------------------------------------------
  // Power action
  // ---------------------------------------------------------------------------

  const handlePower = useCallback(
    async (deviceId: string, action: 'power_on' | 'power_off') => {
      setPowerLoadingId(deviceId);
      try {
        await api.post(`/devices/${deviceId}/power`, { action });
        const label = action === 'power_on' ? 'Power On' : 'Power Off';
        addToast('success', `${label} command sent`);
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'Power action failed');
      } finally {
        setPowerLoadingId(null);
      }
    },
    [addToast],
  );

  // ---------------------------------------------------------------------------
  // Edit mode toggle
  // ---------------------------------------------------------------------------

  const toggleEditMode = useCallback(() => {
    if (isEditMode && pendingChanges.size > 0) {
      // Exiting edit mode with unsaved changes — discard
      const confirmed = window.confirm(
        'You have unsaved position changes. Discard them?',
      );
      if (!confirmed) return;
      setPendingChanges(new Map());
    }
    setIsEditMode((prev) => !prev);
    setSelectedDeviceId(null);
  }, [isEditMode, pendingChanges]);

  // ---------------------------------------------------------------------------
  // Floor change
  // ---------------------------------------------------------------------------

  const handleFloorChange = useCallback(
    (floorId: string) => {
      if (isEditMode && pendingChanges.size > 0) {
        const confirmed = window.confirm(
          'You have unsaved position changes. Discard them?',
        );
        if (!confirmed) return;
      }
      setSelectedFloorId(floorId);
      setPendingChanges(new Map());
      setSelectedDeviceId(null);
    },
    [isEditMode, pendingChanges],
  );

  // ---------------------------------------------------------------------------
  // Selected device for popup
  // ---------------------------------------------------------------------------

  const selectedDevice = useMemo(() => {
    if (!selectedDeviceId) return null;
    return rawDevices.find((d) => d.id === selectedDeviceId) || null;
  }, [rawDevices, selectedDeviceId]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!activeSiteId) {
    return (
      <div>
        <h1 className="text-3xl font-bold text-surface-900 leading-tight mb-4">Floor Map</h1>
        <EmptyState
          icon={MapIcon}
          title="No Site Selected"
          description="Please select a site from the header to view the floor map."
        />
      </div>
    );
  }

  const floorImageUrl = selectedFloor?.background_image
    ? `/storage/${selectedFloor.background_image}`
    : null;

  const isLoading = floorsLoading || devicesLoading;
  const hasChanges = pendingChanges.size > 0;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-surface-900 leading-tight">Floor Map</h1>

          {/* Floor selector */}
          {floors.length > 0 && (
            <div className="relative">
              <select
                value={selectedFloorId || ''}
                onChange={(e) => handleFloorChange(e.target.value)}
                className="h-10 w-[180px] pl-3.5 pr-7 rounded-xl border border-surface-300 card-bg text-base text-surface-600 focus:outline-none focus:ring-1 focus:ring-primary-500 appearance-none"
              >
                {floors.map((f) => (
                  <option key={f.id} value={f.id}>
                    L{f.level} — {f.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-surface-400 pointer-events-none" />
            </div>
          )}

          {/* Floor CRUD buttons */}
          <button
            onClick={() => {
              setEditingFloor(null);
              setFloorDialogOpen(true);
            }}
            title="Add floor"
            className="h-8 w-8 inline-flex items-center justify-center rounded-xl border border-surface-300 text-surface-400 hover:text-surface-600 hover:bg-surface-50"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          {selectedFloor && (
            <>
              <button
                onClick={() => {
                  setEditingFloor(selectedFloor);
                  setFloorDialogOpen(true);
                }}
                title="Edit floor"
                className="h-8 w-8 inline-flex items-center justify-center rounded-xl border border-surface-300 text-surface-400 hover:text-surface-600 hover:bg-surface-50"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setDeleteFloorTarget(selectedFloor)}
                title="Delete floor"
                className="h-8 w-8 inline-flex items-center justify-center rounded-xl border border-surface-300 text-surface-400 hover:text-red-500 hover:bg-surface-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Pending changes indicator */}
          {isEditMode && hasChanges && (
            <span className="text-sm text-amber-600 font-medium">
              {pendingChanges.size} unsaved
            </span>
          )}

          {/* Save button */}
          {isEditMode && (
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              loading={saveMutation.isPending}
              disabled={!hasChanges}
              className="h-9 px-3.5 text-base"
            >
              <Save className="h-3.5 w-3.5" />
              Save Positions
            </Button>
          )}

          {/* Edit mode toggle */}
          <button
            onClick={toggleEditMode}
            className={clsx(
              'h-10 px-3 inline-flex items-center gap-1.5 rounded-xl border text-base font-medium transition-colors',
              isEditMode
                ? 'border-primary-300 bg-primary-50 text-primary-700'
                : 'border-surface-300 card-bg text-surface-700 hover:bg-surface-50',
            )}
          >
            {isEditMode ? (
              <>
                <Eye className="h-3.5 w-3.5" />
                View Mode
              </>
            ) : (
              <>
                <Pencil className="h-3.5 w-3.5" />
                Edit Mode
              </>
            )}
          </button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" className="text-surface-400" />
        </div>
      )}

      {/* No floors */}
      {!isLoading && floors.length === 0 && (
        <EmptyState
          icon={MapIcon}
          title="No Floors"
          description="No floors have been added for this site yet."
        />
      )}

      {/* Map + sidebar layout */}
      {!isLoading && selectedFloor && (
        <div className="flex gap-4">
          {/* Map area */}
          <div className="flex-1 min-w-0">
            <div className="bryzos-card rounded-3xl overflow-hidden">
              {/* Map container with 16:9 aspect ratio */}
              <div
                ref={mapRef}
                className="relative w-full"
                style={{ paddingBottom: '56.25%' }}
              >
                {/* Background image or grid placeholder */}
                <div className="absolute inset-0">
                  {floorImageUrl ? (
                    <img
                      src={floorImageUrl}
                      alt={selectedFloor.name}
                      className="w-full h-full object-contain bg-surface-50"
                      draggable={false}
                    />
                  ) : (
                    <div
                      className="w-full h-full bg-surface-50"
                      style={{
                        backgroundImage:
                          'linear-gradient(to right, rgb(229 231 235 / 0.6) 1px, transparent 1px), linear-gradient(to bottom, rgb(229 231 235 / 0.6) 1px, transparent 1px)',
                        backgroundSize: '40px 40px',
                      }}
                    />
                  )}

                  {/* Edit mode overlay hint */}
                  {isEditMode && (
                    <div className="absolute top-2 left-2 bg-primary-600/90 text-white text-sm font-medium px-2 py-1 rounded">
                      Edit Mode — Drag devices to reposition
                    </div>
                  )}

                  {/* Device markers */}
                  {rawDevices.map((device) => {
                    const pos = getDevicePosition(device, pendingChanges);
                    if (!pos) return null;
                    return (
                      <DeviceMarker
                        key={device.id}
                        device={device}
                        position={pos}
                        isEditMode={isEditMode}
                        isSelected={selectedDeviceId === device.id}
                        onMouseDown={handleMarkerMouseDown(device.id)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDeviceId(
                            selectedDeviceId === device.id ? null : device.id,
                          );
                        }}
                      />
                    );
                  })}

                  {/* Empty map message */}
                  {placedDevices.length === 0 && !isEditMode && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="text-center">
                        <Monitor className="h-8 w-8 text-surface-300 mx-auto mb-2" />
                        <p className="text-base text-surface-400">
                          No devices placed on this floor
                        </p>
                        <p className="text-xs text-surface-300 mt-0.5">
                          Switch to Edit Mode to place devices
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Map footer — legend */}
              <div className="px-3 py-2 border-t border-[var(--glass-border)] flex items-center gap-4">
                {Object.entries(STATUS_COLORS).map(([status, cfg]) => (
                  <div key={status} className="flex items-center gap-1.5">
                    <span className={clsx('h-2 w-2 rounded-full', cfg.bg)} />
                    <span className="text-sm text-surface-500 capitalize">{status}</span>
                  </div>
                ))}
                <div className="flex-1" />
                <span className="text-sm text-surface-400">
                  {placedDevices.length} device(s) placed
                </span>
              </div>
            </div>
          </div>

          {/* Unplaced devices sidebar */}
          <div className="w-56 flex-shrink-0">
            <div className="bryzos-card rounded-3xl">
              <div className="px-3 py-2.5 border-b border-[var(--glass-border)] flex items-center justify-between">
                <span className="text-xs font-medium text-surface-500 uppercase">
                  Unplaced
                </span>
                <Badge
                  variant={unplacedDevices.length > 0 ? 'warning' : 'neutral'}
                  className="text-sm"
                >
                  {unplacedDevices.length}
                </Badge>
              </div>

              {unplacedDevices.length === 0 && (
                <div className="py-6 text-center text-base text-surface-400">
                  All devices placed
                </div>
              )}

              {unplacedDevices.length > 0 && (
                <div className="max-h-[400px] overflow-y-auto">
                  {unplacedDevices.map((device) => (
                    <UnplacedDeviceRow
                      key={device.id}
                      device={device}
                      isEditMode={isEditMode}
                      onDragStart={handleUnplacedDragStart(device.id)}
                    />
                  ))}
                </div>
              )}

              {!isEditMode && unplacedDevices.length > 0 && (
                <div className="px-3 py-2 border-t border-surface-100">
                  <p className="text-sm text-surface-400">
                    Switch to Edit Mode to drag devices onto the map.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Device popup */}
      {selectedDevice && !isEditMode && (
        <DevicePopup
          device={selectedDevice}
          onClose={() => setSelectedDeviceId(null)}
          onNavigate={() => navigate(`/devices/${selectedDevice.id}`)}
          onPower={(action) => handlePower(selectedDevice.id, action)}
          powerLoading={powerLoadingId === selectedDevice.id}
        />
      )}

      {/* Floor create/edit dialog */}
      <FloorDialog
        open={floorDialogOpen}
        floor={editingFloor}
        onClose={() => {
          setFloorDialogOpen(false);
          setEditingFloor(null);
        }}
        onSubmit={(data) => {
          if (editingFloor) {
            updateFloorMutation.mutate({ id: editingFloor.id, ...data });
          } else {
            createFloorMutation.mutate(data);
          }
        }}
        loading={createFloorMutation.isPending || updateFloorMutation.isPending}
      />

      {/* Floor delete confirmation dialog */}
      <DeleteFloorDialog
        floor={deleteFloorTarget}
        onClose={() => setDeleteFloorTarget(null)}
        onConfirm={() => {
          if (deleteFloorTarget) {
            deleteFloorMutation.mutate(deleteFloorTarget.id);
          }
        }}
        loading={deleteFloorMutation.isPending}
      />
    </div>
  );
}
