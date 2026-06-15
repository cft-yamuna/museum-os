import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSiteStore } from '../stores/site';
import { useToastStore } from '../stores/toast';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import type { Schedule, ScheduleType } from '../lib/types';
import {
  Calendar,
  Plus,
  Play,
  Trash2,
  X,
  Clock,
  Repeat,
  Zap,
  Power,
  FileText,
  Music,
  Settings,
  CalendarDays,
  Monitor,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Cron → human-readable helper
// ---------------------------------------------------------------------------

const DAY_NAMES: Record<string, string> = {
  '0': 'Sun', '1': 'Mon', '2': 'Tue', '3': 'Wed',
  '4': 'Thu', '5': 'Fri', '6': 'Sat', '7': 'Sun',
};

const DAY_NAMES_FULL: Record<string, string> = {
  '0': 'Sundays', '1': 'Mondays', '2': 'Tuesdays', '3': 'Wednesdays',
  '4': 'Thursdays', '5': 'Fridays', '6': 'Saturdays', '7': 'Sundays',
};

function formatHourMinute(hour: number, minute: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 || 12;
  const m = minute.toString().padStart(2, '0');
  return `${h}:${m} ${period}`;
}

export function cronToHuman(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;

  const [minute, hour, dom, , dow] = parts;
  const minuteNum = parseInt(minute, 10);
  const hourNum = parseInt(hour, 10);
  if (isNaN(minuteNum) || isNaN(hourNum)) return cron;

  const timeStr = formatHourMinute(hourNum, minuteNum);

  if (dom === '*' && dow === '*') return `Daily at ${timeStr}`;
  if (dom === '*' && dow === '1-5') return `Weekdays at ${timeStr}`;
  if (dom === '*' && dow === '0,6') return `Weekends at ${timeStr}`;
  if (dom === '*' && /^[0-7]$/.test(dow)) return `${DAY_NAMES_FULL[dow] || dow} at ${timeStr}`;
  if (dom === '*' && /^[0-7](,[0-7])+$/.test(dow)) {
    const dayNames = dow.split(',').map((d) => DAY_NAMES[d] || d);
    return `${dayNames.join(', ')} at ${timeStr}`;
  }
  const domNum = parseInt(dom, 10);
  if (!isNaN(domNum) && dow === '*') {
    const suffix = domNum === 1 ? 'st' : domNum === 2 ? 'nd' : domNum === 3 ? 'rd' : 'th';
    return `Monthly on the ${domNum}${suffix} at ${timeStr}`;
  }
  return cron;
}

// Determine schedule frequency category for grouping
function getFrequencyGroup(cron: string): { key: string; label: string; order: number } {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return { key: 'custom', label: 'Custom', order: 5 };

  const [, , dom, , dow] = parts;

  if (dom === '*' && dow === '*') return { key: 'daily', label: 'Daily', order: 1 };
  if (dom === '*' && dow === '1-5') return { key: 'weekdays', label: 'Weekdays Only', order: 2 };
  if (dom === '*' && dow === '0,6') return { key: 'weekends', label: 'Weekends Only', order: 3 };
  if (dom === '*' && /^[0-7](,[0-7])*$/.test(dow)) {
    const count = dow.split(',').length;
    if (count === 1) return { key: 'weekly', label: 'Weekly (1 day)', order: 4 };
    return { key: `${count}-day`, label: `${count} Days/Week`, order: 3 };
  }
  if (dom !== '*' && dow === '*') return { key: 'monthly', label: 'Monthly', order: 6 };
  return { key: 'custom', label: 'Custom Schedule', order: 7 };
}

// ---------------------------------------------------------------------------
// Type visual metadata
// ---------------------------------------------------------------------------

const TYPE_META: Record<ScheduleType, { icon: typeof Power; color: string; bgColor: string; label: string }> = {
  power: { icon: Power, color: 'text-amber-600', bgColor: 'bg-amber-500/5', label: 'Power' },
  content: { icon: FileText, color: 'text-blue-600', bgColor: 'bg-blue-500/5', label: 'Content' },
  playlist: { icon: Music, color: 'text-emerald-600', bgColor: 'bg-emerald-500/5', label: 'Playlist' },
  maintenance: { icon: Settings, color: 'text-surface-600', bgColor: 'bg-surface-100', label: 'Maintenance' },
  event: { icon: CalendarDays, color: 'text-red-600', bgColor: 'bg-red-500/5', label: 'Event' },
};

const TYPE_BADGE_VARIANT: Record<ScheduleType, 'info' | 'success' | 'warning' | 'danger' | 'neutral'> = {
  power: 'warning',
  content: 'info',
  playlist: 'success',
  maintenance: 'neutral',
  event: 'danger',
};

const SCHEDULE_TYPES: ScheduleType[] = ['power', 'content', 'playlist', 'maintenance', 'event'];

// ---------------------------------------------------------------------------
// Delete Confirmation Dialog
// ---------------------------------------------------------------------------

function DeleteDialog({ open, name, loading, onConfirm, onCancel }: {
  open: boolean; name: string; loading: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={loading ? undefined : onCancel} />
      <div className="relative card-bg rounded-xl shadow-xl w-full max-w-sm mx-4">
        <div className="p-5">
          <h3 className="text-sm font-semibold text-surface-900 mb-2">Delete Schedule</h3>
          <p className="text-base text-surface-600">
            Are you sure you want to delete <span className="font-semibold">{name}</span>?
            This action cannot be undone.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-[var(--glass-border)] bg-surface-50 rounded-b-xl">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={loading}>Cancel</Button>
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
// Toggle Switch
// ---------------------------------------------------------------------------

function ToggleSwitch({ checked, disabled, onChange }: {
  checked: boolean; disabled?: boolean; onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? 'bg-primary-600' : 'bg-surface-300'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main: ScheduleListPage
// ---------------------------------------------------------------------------

export function ScheduleListPage() {
  const navigate = useNavigate();
  const activeSiteId = useSiteStore((s) => s.activeSiteId);
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();

  const [typeFilter, setTypeFilter] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Schedule | null>(null);

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['schedules', activeSiteId],
    queryFn: () => api.get<Schedule[]>(`/schedules?site_id=${activeSiteId}`),
    enabled: !!activeSiteId,
  });

  const toggleMutation = useMutation({
    mutationFn: (schedule: Schedule) => {
      const endpoint = schedule.is_enabled ? 'disable' : 'enable';
      return api.post<Schedule>(`/schedules/${schedule.id}/${endpoint}`);
    },
    onSuccess: (_data, schedule) => {
      addToast('success', `Schedule ${schedule.is_enabled ? 'disabled' : 'enabled'}`);
      queryClient.invalidateQueries({ queryKey: ['schedules', activeSiteId] });
    },
    onError: (err) => {
      addToast('error', err instanceof Error ? err.message : 'Toggle failed');
    },
  });

  const executeMutation = useMutation({
    mutationFn: (id: string) => api.post(`/schedules/${id}/execute`),
    onSuccess: () => {
      addToast('success', 'Schedule executed');
      queryClient.invalidateQueries({ queryKey: ['schedules', activeSiteId] });
    },
    onError: (err) => {
      addToast('error', err instanceof Error ? err.message : 'Execute failed');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/schedules/${id}`),
    onSuccess: () => {
      addToast('success', 'Schedule deleted');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['schedules', activeSiteId] });
    },
    onError: (err) => {
      addToast('error', err instanceof Error ? err.message : 'Delete failed');
    },
  });

  const filtered = useMemo(() => {
    if (!typeFilter) return schedules;
    return schedules.filter((s) => s.type === typeFilter);
  }, [schedules, typeFilter]);

  // Group by frequency
  const groupedByFrequency = useMemo(() => {
    const groups: Record<string, { label: string; order: number; items: Schedule[] }> = {};
    filtered.forEach((s) => {
      const freq = getFrequencyGroup(s.cron_expression);
      if (!groups[freq.key]) {
        groups[freq.key] = { label: freq.label, order: freq.order, items: [] };
      }
      groups[freq.key].items.push(s);
    });
    return Object.entries(groups)
      .sort(([, a], [, b]) => a.order - b.order)
      .map(([key, val]) => ({ key, ...val }));
  }, [filtered]);

  // Stats
  const stats = useMemo(() => {
    const enabled = schedules.filter((s) => s.is_enabled).length;
    const power = schedules.filter((s) => s.type === 'power').length;
    const content = schedules.filter((s) => s.type === 'content' || s.type === 'playlist').length;
    return { total: schedules.length, enabled, power, content };
  }, [schedules]);

  const hasActiveFilters = !!typeFilter;
  const clearFilters = useCallback(() => setTypeFilter(''), []);

  if (!activeSiteId) {
    return (
      <div>
        <h1 className="text-3xl font-bold text-surface-900 leading-tight mb-4">Schedules</h1>
        <EmptyState icon={Calendar} title="No Site Selected" description="Please select a site from the header to view schedules." />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-surface-900 leading-tight">Schedules</h1>
          {!isLoading && schedules.length > 0 && (
            <p className="text-base text-surface-400 mt-0.5">{stats.enabled} of {stats.total} schedule{stats.total !== 1 ? 's' : ''} enabled</p>
          )}
        </div>
        <Button size="sm" onClick={() => navigate('/schedules/new')}>
          <Plus className="h-3.5 w-3.5" />
          New Schedule
        </Button>
      </div>

      {/* Stats cards */}
      {!isLoading && schedules.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bryzos-card rounded-3xl p-3.5">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-7 w-7 rounded-lg bg-primary-500/5 flex items-center justify-center">
                <Calendar className="h-3.5 w-3.5 text-primary-600" />
              </div>
              <span className="text-sm font-medium text-surface-400 uppercase tracking-wider">Total</span>
            </div>
            <span className="text-2xl font-bold text-surface-900">{stats.total}</span>
          </div>
          <div className="bryzos-card rounded-3xl p-3.5">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-7 w-7 rounded-lg bg-emerald-500/5 flex items-center justify-center">
                <Zap className="h-3.5 w-3.5 text-emerald-600" />
              </div>
              <span className="text-sm font-medium text-surface-400 uppercase tracking-wider">Active</span>
            </div>
            <span className="text-2xl font-bold text-emerald-600">{stats.enabled}</span>
          </div>
          <div className="bryzos-card rounded-3xl p-3.5">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-7 w-7 rounded-lg bg-amber-500/5 flex items-center justify-center">
                <Power className="h-3.5 w-3.5 text-amber-600" />
              </div>
              <span className="text-sm font-medium text-surface-400 uppercase tracking-wider">Power</span>
            </div>
            <span className="text-2xl font-bold text-surface-900">{stats.power}</span>
          </div>
          <div className="bryzos-card rounded-3xl p-3.5">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-7 w-7 rounded-lg bg-blue-500/5 flex items-center justify-center">
                <FileText className="h-3.5 w-3.5 text-blue-600" />
              </div>
              <span className="text-sm font-medium text-surface-400 uppercase tracking-wider">Content</span>
            </div>
            <span className="text-2xl font-bold text-surface-900">{stats.content}</span>
          </div>
        </div>
      )}

      {/* Type filter chips */}
      {!isLoading && schedules.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-surface-400 mr-1">Filter:</span>
          {SCHEDULE_TYPES.map((t) => {
            const meta = TYPE_META[t];
            const count = schedules.filter((s) => s.type === t).length;
            if (count === 0) return null;
            const isActive = typeFilter === t;
            return (
              <button
                key={t}
                onClick={() => setTypeFilter(isActive ? '' : t)}
                className={`h-9 px-3.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${
                  isActive
                    ? `${meta.bgColor} ${meta.color} ring-1 ring-current ring-opacity-30`
                    : 'bg-surface-100 text-surface-500 hover:bg-surface-200'
                }`}
              >
                <meta.icon className="h-3 w-3" />
                {meta.label}
                <span className={`text-[10px] ${isActive ? 'opacity-70' : 'opacity-50'}`}>{count}</span>
              </button>
            );
          })}

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="h-9 px-2 inline-flex items-center gap-1 rounded-xl text-sm text-surface-500 hover:text-surface-700 hover:bg-surface-100"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" className="text-surface-400" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filtered.length === 0 && (
        <EmptyState
          icon={Calendar}
          title={hasActiveFilters ? 'No Matching Schedules' : 'No Schedules'}
          description={
            hasActiveFilters
              ? 'Try adjusting your filter.'
              : 'Schedules automate device actions on a cron timer — power on/off, content pushes, and more.'
          }
          action={
            hasActiveFilters ? (
              <button onClick={clearFilters} className="h-10 px-3 rounded-xl border border-surface-300 text-base text-surface-600 hover:bg-surface-50">
                Clear filters
              </button>
            ) : (
              <Button size="sm" onClick={() => navigate('/schedules/new')}>
                <Plus className="h-3.5 w-3.5" />
                New Schedule
              </Button>
            )
          }
        />
      )}

      {/* Grouped schedule cards */}
      {!isLoading && filtered.length > 0 && (
        <div className="space-y-6">
          {groupedByFrequency.map((group) => (
            <div key={group.key}>
              {/* Frequency group header */}
              <div className="flex items-center gap-2 mb-3">
                <div className="h-6 w-6 rounded-xl bg-surface-100 flex items-center justify-center">
                  <Repeat className="h-3.5 w-3.5 text-surface-500" />
                </div>
                <span className="text-base font-semibold text-surface-700">{group.label}</span>
                <span className="text-sm text-surface-400 bg-surface-100 px-1.5 py-0.5 rounded-full">{group.items.length}</span>
              </div>

              {/* Schedule cards in this group */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {group.items.map((schedule) => {
                  const typeMeta = TYPE_META[schedule.type] || TYPE_META.maintenance;
                  const TypeIcon = typeMeta.icon;

                  return (
                    <div
                      key={schedule.id}
                      onClick={() => navigate(`/schedules/${schedule.id}/edit`)}
                      className={`group border rounded-xl card-bg hover:shadow-md transition-all cursor-pointer overflow-hidden ${
                        schedule.is_enabled ? 'border-surface-200 hover:border-surface-300' : 'border-surface-200 opacity-60 hover:opacity-100'
                      }`}
                    >
                      {/* Top accent */}
                      <div className={`h-0.5 ${typeMeta.bgColor}`} style={{ opacity: schedule.is_enabled ? 0.8 : 0.3 }} />

                      <div className="p-3.5">
                        <div className="flex items-start justify-between mb-2">
                          {/* Type + name */}
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className={`h-8 w-8 rounded-lg ${typeMeta.bgColor} flex items-center justify-center shrink-0`}>
                              <TypeIcon className={`h-4 w-4 ${typeMeta.color}`} />
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-[14px] font-semibold text-surface-900 group-hover:text-primary-600 transition-colors truncate">
                                {schedule.name}
                              </h3>
                              <div className="flex items-center gap-2 mt-0.5">
                                <Badge variant={TYPE_BADGE_VARIANT[schedule.type]}>{schedule.type}</Badge>
                                <span className="text-sm text-surface-400">{schedule.action}</span>
                              </div>
                            </div>
                          </div>

                          {/* Toggle */}
                          <div onClick={(e) => e.stopPropagation()}>
                            <ToggleSwitch
                              checked={schedule.is_enabled}
                              disabled={toggleMutation.isPending}
                              onChange={() => toggleMutation.mutate(schedule)}
                            />
                          </div>
                        </div>

                        {/* Schedule info + targets */}
                        <div className="flex items-center gap-4 mt-3 pt-2.5 border-t border-surface-100">
                          <div className="flex items-center gap-1.5 text-sm text-surface-500">
                            <Clock className="h-3 w-3 text-surface-400" />
                            <span>{cronToHuman(schedule.cron_expression)}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-sm text-surface-500">
                            <Monitor className="h-3 w-3 text-surface-400" />
                            <span>{schedule.target_ids.length} {schedule.target_type}{schedule.target_ids.length !== 1 ? 's' : ''}</span>
                          </div>

                          {/* Actions */}
                          <div className="ml-auto flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => executeMutation.mutate(schedule.id)}
                              disabled={executeMutation.isPending}
                              className="h-6 px-2 inline-flex items-center gap-1 rounded-xl text-sm font-medium text-surface-500 hover:text-primary-600 hover:bg-primary-500/5 transition-colors"
                              title="Run Now"
                            >
                              <Play className="h-3 w-3" />
                              Run
                            </button>
                            <button
                              onClick={() => setDeleteTarget(schedule)}
                              className="h-6 w-6 inline-flex items-center justify-center rounded-xl text-surface-400 hover:text-red-500 hover:bg-red-500/5 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete dialog */}
      <DeleteDialog
        open={deleteTarget !== null}
        name={deleteTarget?.name ?? ''}
        loading={deleteMutation.isPending}
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id); }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
