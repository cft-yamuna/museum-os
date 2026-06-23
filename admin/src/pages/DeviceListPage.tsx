import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSiteStore } from '../stores/site';
import { useToastStore } from '../stores/toast';
import { api } from '../lib/api';
import { sendAgentCommand } from '../lib/agentApi';
import { adminWs } from '../lib/ws';
import { Spinner } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { DeviceSyncBadge } from '../components/DeviceSyncBadge';
import { useDeviceSyncTracking } from '../hooks/useDeviceSyncTracking';
import type { Device } from '../lib/types';
import { useDeviceSyncStore } from '../stores/deviceSync';
import {
  Search,
  Monitor,
  Plus,
  X,
  Power,
  PowerOff,
  RotateCcw,
  Camera,
  Cpu,
  Terminal,
  Trash2,
  Pencil,
} from 'lucide-react';

// Status configuration
const STATUS_CONFIG: Record<Device['status'], { dot: string; bg: string; text: string; label: string }> = {
  online: { dot: 'bg-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-300', label: 'Online' },
  error: { dot: 'bg-red-600', bg: 'bg-red-50 dark:bg-red-500/10', text: 'text-red-700 dark:text-red-300', label: 'Error' },
  offline: { dot: 'bg-surface-400', bg: 'bg-surface-100', text: 'text-surface-600', label: 'Offline' },
  unavailable: { dot: 'bg-surface-400', bg: 'bg-surface-100', text: 'text-surface-500', label: 'Unavailable' },
  restarting: { dot: 'bg-blue-500', bg: 'bg-blue-50 dark:bg-blue-500/10', text: 'text-blue-700 dark:text-blue-300', label: 'Restarting' },
};

function StatusDot({ status }: { status: Device['status'] }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.offline;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function formatHeartbeat(ts: string | null): string {
  if (!ts) return 'Never';
  const d = new Date(ts);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString();
}

export function DeviceListPage() {
  const navigate = useNavigate();
  const activeSiteId = useSiteStore((s) => s.activeSiteId);
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkAgentConfirm, setBulkAgentConfirm] = useState<{
    command: string;
    label: string;
  } | null>(null);
  const [bulkPowerConfirm, setBulkPowerConfirm] = useState<{
    action: 'power_on' | 'power_off' | 'restart';
    label: string;
  } | null>(null);

  // Fetch devices
  const { data: devices = [], isLoading } = useQuery({
    queryKey: ['devices', activeSiteId],
    queryFn: () => api.get<Device[]>(`/devices?site_id=${activeSiteId}`),
    enabled: !!activeSiteId,
  });
  const deviceSyncStatuses = useDeviceSyncStore((state) => state.statuses);

  useDeviceSyncTracking(devices.map((device) => device.id));

  // Real-time status updates via WebSocket
  useEffect(() => {
    const unsub = adminWs.on('device:status', (_event, data) => {
      const update = data as { device_id: string; status: Device['status']; last_seen?: string };
      queryClient.setQueryData<Device[]>(['devices', activeSiteId], (old) => {
        if (!old) return old;
        return old.map((d) =>
          d.id === update.device_id
            ? { ...d, status: update.status, last_seen: update.last_seen || d.last_seen }
            : d
        );
      });
    });
    return unsub;
  }, [activeSiteId, queryClient]);

  // Derive unique device types for filter dropdown
  const deviceTypes = useMemo(() => {
    const types = new Set(devices.map((d) => d.type));
    return Array.from(types).sort();
  }, [devices]);

  // Filter devices
  const filtered = useMemo(() => {
    return devices.filter((d) => {
      if (search && !d.display_name.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter && d.status !== statusFilter) return false;
      if (typeFilter && d.type !== typeFilter) return false;
      return true;
    });
  }, [devices, search, statusFilter, typeFilter]);

  const hasActiveFilters = search || statusFilter || typeFilter;

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setTypeFilter('');
  };

  // Selection logic
  const allSelected = filtered.length > 0 && selected.size === filtered.length;
  const someSelected = selected.size > 0 && selected.size < filtered.length;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((d) => d.id)));
    }
  };

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Bulk actions
  const bulkAction = async (action: 'power_on' | 'power_off' | 'restart') => {
    if (selected.size === 0) return;
    setBulkLoading(true);
    const ids = Array.from(selected);
    const label = action === 'power_on' ? 'Power On' : action === 'power_off' ? 'Power Off' : 'Restart';

    try {
      await Promise.all(
        ids.map((id) =>
          api.post(`/devices/${id}/power`, { action })
        )
      );
      addToast('success', `${label} sent to ${ids.length} device(s)`);
      setSelected(new Set());
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : `${label} failed`);
    } finally {
      setBulkLoading(false);
    }
  };

  // Bulk agent command
  const bulkAgentAction = async (command: string, label: string) => {
    setBulkLoading(true);
    const ids = Array.from(selected).filter((id) => {
      const d = devices.find((dev) => dev.id === id);
      return d?.agent_connected;
    });
    if (ids.length === 0) {
      addToast('warning', 'No selected devices have agents connected');
      setBulkLoading(false);
      return;
    }
    try {
      await Promise.all(ids.map((id) => sendAgentCommand(id, command)));
      addToast('success', `${label} sent to ${ids.length} agent(s)`);
      setSelected(new Set());
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : `${label} failed`);
    } finally {
      setBulkLoading(false);
      setBulkAgentConfirm(null);
    }
  };

  // Single device delete
  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null);
  const deleteDeviceMutation = useMutation({
    mutationFn: (deviceId: string) => api.delete(`/devices/${deviceId}`),
    onSuccess: () => {
      addToast('success', 'Device deleted');
      queryClient.invalidateQueries({ queryKey: ['devices', activeSiteId] });
      setDeleteTarget(null);
    },
    onError: (err) => {
      addToast('error', err instanceof Error ? err.message : 'Failed to delete');
    },
  });

  // Bulk delete
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const bulkDelete = async () => {
    if (selected.size === 0) return;
    setBulkLoading(true);
    const ids = Array.from(selected);
    try {
      await Promise.all(ids.map((id) => api.delete(`/devices/${id}`)));
      addToast('success', `${ids.length} device(s) deleted`);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ['devices', activeSiteId] });
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBulkLoading(false);
      setBulkDeleteConfirm(false);
    }
  };

  // Stats
  const onlineCount = devices.filter(d => d.status === 'online').length;
  const errorCount = devices.filter(d => d.status === 'error').length;

  // No site selected
  if (!activeSiteId) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-semibold tracking-tight text-surface-950">Devices</h1>
        <EmptyState
          icon={Monitor}
          title="No Site Selected"
          description="Please select a site from the header to view devices."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-surface-500">Operations</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-surface-950">Devices</h1>
          {!isLoading && devices.length > 0 && (
            <p className="mt-1 text-sm text-surface-500">
              {devices.length} total &middot; {onlineCount} online
              {errorCount > 0 && <span className="text-red-500"> &middot; {errorCount} error</span>}
              {selected.size > 0 && <span className="text-primary-600 font-medium"> &middot; {selected.size} selected</span>}
            </p>
          )}
        </div>
        <Button onClick={() => navigate('/devices/new')}>
          <Plus className="h-5 w-5" />
          Add Device
        </Button>
      </div>

      {/* Search + Filters */}
      {!isLoading && devices.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="card-bg h-10 w-full rounded-md border border-surface-300 pl-9 pr-9 text-sm text-surface-800 placeholder:text-surface-400 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              placeholder="Search devices..."
            />
            {search && (
              <button type="button" aria-label="Clear search" onClick={() => setSearch('')} className="admin-focus absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-surface-400 hover:text-surface-600">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="card-bg h-10 rounded-md border border-surface-300 px-3 text-sm text-surface-700 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          >
            <option value="">All Status</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
            <option value="unavailable">Unavailable</option>
            <option value="error">Error</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="card-bg h-10 rounded-md border border-surface-300 px-3 text-sm text-surface-700 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          >
            <option value="">All Types</option>
            {deviceTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="admin-focus inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-surface-500 transition-colors hover:bg-surface-100 hover:text-surface-800"
            >
              <X className="h-4 w-4" />
              Clear
            </button>
          )}
        </div>
      )}

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="admin-card flex flex-wrap items-center gap-2 border-l-4 border-l-primary-700 px-4 py-3">
          <span className="text-sm font-medium text-primary-700 mr-2">{selected.size} selected</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setBulkPowerConfirm({ action: 'power_on', label: 'Power On' })}
              disabled={bulkLoading}
              className="card-bg inline-flex h-9 items-center gap-1.5 rounded-md border border-surface-300 px-3 text-sm font-semibold text-surface-700 transition-colors hover:bg-surface-50 disabled:opacity-50"
            >
              <Power className="h-4 w-4 text-emerald-500" />
              Power On
            </button>
            <button
              onClick={() => setBulkPowerConfirm({ action: 'power_off', label: 'Power Off' })}
              disabled={bulkLoading}
              className="card-bg inline-flex h-9 items-center gap-1.5 rounded-md border border-surface-300 px-3 text-sm font-semibold text-surface-700 transition-colors hover:bg-surface-50 disabled:opacity-50"
            >
              <PowerOff className="h-4 w-4 text-red-500" />
              Power Off
            </button>
            <button
              onClick={() => setBulkPowerConfirm({ action: 'restart', label: 'Restart' })}
              disabled={bulkLoading}
              className="card-bg inline-flex h-9 items-center gap-1.5 rounded-md border border-surface-300 px-3 text-sm font-semibold text-surface-700 transition-colors hover:bg-surface-50 disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4 text-amber-500" />
              Restart
            </button>

            <div className="w-px h-6 bg-surface-200 mx-1" />

            <button
              onClick={() => setBulkAgentConfirm({ command: 'system:reboot', label: 'Reboot' })}
              disabled={bulkLoading}
              className="card-bg inline-flex h-9 items-center gap-1.5 rounded-md border border-surface-300 px-3 text-sm font-semibold text-surface-700 transition-colors hover:bg-surface-50 disabled:opacity-50"
              title="Send reboot command to selected agents"
            >
              <Cpu className="h-4 w-4 text-sky-500" />
              Reboot
            </button>
            <button
              onClick={() => bulkAgentAction('kiosk:restart', 'Restart Browser')}
              disabled={bulkLoading}
              className="card-bg inline-flex h-9 items-center gap-1.5 rounded-md border border-surface-300 px-3 text-sm font-semibold text-surface-700 transition-colors hover:bg-surface-50 disabled:opacity-50"
              title="Restart browser on selected agents"
            >
              <Terminal className="h-4 w-4 text-pink-500" />
              Browser
            </button>
            <button
              onClick={() => bulkAgentAction('kiosk:screenshot', 'Screenshot')}
              disabled={bulkLoading}
              className="card-bg inline-flex h-9 items-center gap-1.5 rounded-md border border-surface-300 px-3 text-sm font-semibold text-surface-700 transition-colors hover:bg-surface-50 disabled:opacity-50"
              title="Capture screenshots from selected agents"
            >
              <Camera className="h-4 w-4 text-teal-500" />
              Screenshot
            </button>

            <div className="w-px h-6 bg-surface-200 mx-1" />

            <button
              onClick={() => setBulkDeleteConfirm(true)}
              disabled={bulkLoading}
              className="card-bg inline-flex h-9 items-center gap-1.5 rounded-md border border-red-200 px-3 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10 disabled:opacity-50"
              title="Delete selected devices"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" className="text-surface-400" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filtered.length === 0 && (
        <EmptyState
          icon={Monitor}
          title={hasActiveFilters ? 'No Matching Devices' : 'No Devices'}
          description={
            hasActiveFilters
              ? 'Try adjusting your search or filters.'
              : 'Devices are physical screens, kiosks, and projectors. Register one to start displaying content.'
          }
          action={
            hasActiveFilters ? (
              <button
                onClick={clearFilters}
                className="h-10 rounded-md border border-surface-300 px-4 text-sm font-semibold text-surface-700 hover:bg-surface-50"
              >
                Clear filters
              </button>
            ) : undefined
          }
        />
      )}

      {/* Data table */}
      {!isLoading && filtered.length > 0 && (
        <div className="admin-card overflow-hidden">
          <table className="w-full">
            <thead className="bg-surface-50 border-b border-surface-200">
              <tr>
                <th className="w-12 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-surface-300 cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-surface-500 w-[100px]">
                  Display
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-surface-500">
                  Name
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-surface-500 md:table-cell">
                  App
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-surface-500">
                  Type
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-surface-500 md:table-cell w-[120px]">
                  System
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-surface-500 lg:table-cell">
                  Zone
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-surface-500 sm:table-cell">
                  Last Seen
                </th>
                <th className="w-12 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {filtered.map((device) => (
                <tr
                  key={device.id}
                  onClick={() => navigate(`/devices/${device.id}`)}
                  className="hover:bg-surface-50 transition-colors cursor-pointer group"
                >
                  <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(device.id)}
                      onChange={() => toggleOne(device.id)}
                      className="h-4 w-4 rounded border-surface-300 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusDot status={device.status} />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="text-sm font-semibold text-surface-900 transition-colors group-hover:text-primary-700">
                      {device.display_name}
                    </div>
                    {device.app_id && (
                      <div className="mt-1">
                        <DeviceSyncBadge status={deviceSyncStatuses[device.id]} />
                      </div>
                    )}
                  </td>
                  <td className="hidden px-4 py-3.5 md:table-cell" onClick={(e) => e.stopPropagation()}>
                    {device.app_id ? (
                      <button
                        onClick={() => navigate(`/apps/${device.app_id}`)}
                        className="text-sm font-medium text-primary-700 hover:text-primary-800 hover:underline"
                      >
                        {device.app_name || 'View app'}
                      </button>
                    ) : (
                      <span className="text-sm text-surface-400">--</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-surface-600 capitalize">
                    {device.type}
                  </td>
                  <td className="px-4 py-3.5 hidden md:table-cell">
                    {device.agent_connected ? (
                      <span className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                        Online
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-semibold bg-surface-100 text-surface-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-surface-400" />
                        Offline
                      </span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3.5 text-sm text-surface-500 lg:table-cell">
                    {device.floor_id || '--'}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-surface-400 hidden sm:table-cell">
                    {formatHeartbeat(device.last_seen)}
                  </td>
                  <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => navigate(`/devices/${device.id}`)}
                        aria-label={`Edit ${device.display_name}`}
                        className="admin-focus flex h-8 w-8 items-center justify-center rounded-md text-surface-400 transition-colors hover:bg-primary-50 hover:text-primary-700"
                        title="Edit device"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(device)}
                        aria-label={`Delete ${device.display_name}`}
                        className="admin-focus flex h-8 w-8 items-center justify-center rounded-md text-surface-400 transition-colors hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                        title="Delete device"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer count */}
      {!isLoading && filtered.length > 0 && (
        <div className="text-sm text-surface-400">
          Showing {filtered.length} of {devices.length} device(s)
        </div>
      )}

      {/* Bulk power confirm dialog */}
      <ConfirmDialog
        open={!!bulkPowerConfirm}
        title={`${bulkPowerConfirm?.label || ''} Selected Devices?`}
        message={`This will send ${bulkPowerConfirm?.label || ''} to ${selected.size} selected device(s).`}
        confirmLabel={bulkPowerConfirm?.label || 'Confirm'}
        variant={bulkPowerConfirm?.action === 'power_off' ? 'danger' : 'primary'}
        loading={bulkLoading}
        onConfirm={() => {
          if (bulkPowerConfirm) {
            bulkAction(bulkPowerConfirm.action);
            setBulkPowerConfirm(null);
          }
        }}
        onCancel={() => setBulkPowerConfirm(null)}
      />

      {/* Bulk agent confirm dialog */}
      <ConfirmDialog
        open={!!bulkAgentConfirm}
        title={`${bulkAgentConfirm?.label || ''} Selected Devices?`}
        message={`This will send the ${bulkAgentConfirm?.label || ''} command to ${selected.size} selected device(s) with connected agents.`}
        confirmLabel={bulkAgentConfirm?.label || 'Confirm'}
        variant="danger"
        loading={bulkLoading}
        onConfirm={() => {
          if (bulkAgentConfirm) {
            bulkAgentAction(bulkAgentConfirm.command, bulkAgentConfirm.label);
          }
        }}
        onCancel={() => setBulkAgentConfirm(null)}
      />

      {/* Single device delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Device?"
        message={`This will permanently delete "${deleteTarget?.display_name || ''}". This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleteDeviceMutation.isPending}
        onConfirm={() => { if (deleteTarget) deleteDeviceMutation.mutate(deleteTarget.id); }}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Bulk delete confirm */}
      <ConfirmDialog
        open={bulkDeleteConfirm}
        title="Delete Selected Devices?"
        message={`This will permanently delete ${selected.size} selected device(s). This action cannot be undone.`}
        confirmLabel="Delete All"
        variant="danger"
        loading={bulkLoading}
        onConfirm={bulkDelete}
        onCancel={() => setBulkDeleteConfirm(false)}
      />
    </div>
  );
}
