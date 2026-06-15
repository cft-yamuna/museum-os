import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CheckCircle2,
  X,
  AlertTriangle,
} from 'lucide-react';
import clsx from 'clsx';
import { api } from '../lib/api';
import { adminWs } from '../lib/ws';
import { useSiteStore } from '../stores/site';
import { useToastStore } from '../stores/toast';
import { formatDateTime } from '../lib/utils';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import type { Alert, Device } from '../lib/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PER_PAGE = 25;

const SEVERITY_OPTIONS = ['all', 'critical', 'high', 'medium', 'low'] as const;

const TYPE_OPTIONS = [
  'all',
  'device_offline',
  'disk_space',
  'memory_usage',
  'cpu_usage',
  'network_error',
  'heartbeat_timeout',
  'content_sync_failed',
  'display_error',
] as const;

const STATUS_OPTIONS = ['all', 'unacknowledged', 'acknowledged'] as const;

type SeverityFilter = (typeof SEVERITY_OPTIONS)[number];
type TypeFilter = (typeof TYPE_OPTIONS)[number];
type StatusFilter = (typeof STATUS_OPTIONS)[number];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function severityBadgeVariant(severity: Alert['severity']): 'danger' | 'warning' | 'info' {
  if (severity === 'critical' || severity === 'high') return 'danger';
  if (severity === 'medium') return 'warning';
  return 'info';
}

function severityLabel(severity: string): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

function typeLabel(type: string): string {
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------------------
// Response type
// ---------------------------------------------------------------------------

interface AlertsResponse {
  alerts: Alert[];
  total: number;
}

// ---------------------------------------------------------------------------
// Expanded row detail
// ---------------------------------------------------------------------------

function AlertDetailRow({ alert }: { alert: Alert }) {
  return (
    <tr>
      <td colSpan={7} className="px-3 py-3 bg-surface-50">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-base">
          <div>
            <span className="text-xs font-medium text-surface-500 uppercase">Full Message</span>
            <p className="text-surface-800 mt-0.5">{alert.message}</p>
          </div>
          <div>
            <span className="text-xs font-medium text-surface-500 uppercase">Alert ID</span>
            <p className="text-surface-600 mt-0.5 font-mono text-xs">{alert.id}</p>
          </div>
          <div>
            <span className="text-xs font-medium text-surface-500 uppercase">Device ID</span>
            <p className="text-surface-600 mt-0.5 font-mono text-xs">{alert.device_id || '--'}</p>
          </div>
          <div>
            <span className="text-xs font-medium text-surface-500 uppercase">Type</span>
            <p className="text-surface-600 mt-0.5">{typeLabel(alert.type)}</p>
          </div>
          <div>
            <span className="text-xs font-medium text-surface-500 uppercase">Created</span>
            <p className="text-surface-600 mt-0.5">{formatDateTime(alert.created_at)}</p>
          </div>
          <div>
            <span className="text-xs font-medium text-surface-500 uppercase">Acknowledged</span>
            <p className="text-surface-600 mt-0.5">
              {alert.is_acknowledged
                ? `Yes${alert.acknowledged_by ? ` by ${alert.acknowledged_by}` : ''}`
                : 'No'}
            </p>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AlertsPage() {
  const activeSiteId = useSiteStore((s) => s.activeSiteId);
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Filters
  const [severity, setSeverity] = useState<SeverityFilter>('all');
  const [alertType, setAlertType] = useState<TypeFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Pagination
  const [page, setPage] = useState(1);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Expanded rows
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // New alerts banner
  const [newAlertCount, setNewAlertCount] = useState(0);
  const tableRef = useRef<HTMLDivElement>(null);

  // Reset page when filters change
  const resetPage = useCallback(() => {
    setPage(1);
    setSelected(new Set());
  }, []);

  // Build query params
  const queryKey = ['alerts', activeSiteId, severity, alertType, status, dateFrom, dateTo, page];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!activeSiteId) return { alerts: [], total: 0 } as AlertsResponse;

      const params = new URLSearchParams();
      params.set('site_id', activeSiteId);
      params.set('limit', String(PER_PAGE));
      params.set('offset', String((page - 1) * PER_PAGE));

      if (severity !== 'all') params.set('severity', severity);
      if (alertType !== 'all') params.set('type', alertType);
      if (status === 'acknowledged') params.set('is_acknowledged', 'true');
      if (status === 'unacknowledged') params.set('is_acknowledged', 'false');
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);

      return api.get<AlertsResponse>(`/alerts?${params.toString()}`);
    },
    enabled: !!activeSiteId,
  });

  // Fetch devices for name lookup
  const { data: devices = [] } = useQuery({
    queryKey: ['devices', activeSiteId],
    queryFn: () => api.get<Device[]>(`/devices?site_id=${activeSiteId}`),
    enabled: !!activeSiteId,
  });

  const deviceNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of devices) map.set(d.id, d.display_name);
    return map;
  }, [devices]);

  const alerts = data?.alerts ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  // Real-time: listen for new alerts
  useEffect(() => {
    const unsub = adminWs.on('alert:created', () => {
      setNewAlertCount((prev) => prev + 1);
    });
    return unsub;
  }, []);

  const dismissBanner = useCallback(() => {
    setNewAlertCount(0);
    queryClient.invalidateQueries({ queryKey: ['alerts'] });
  }, [queryClient]);

  // Bulk acknowledge mutation
  const acknowledgeMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => api.post(`/alerts/${id}/ack`)));
    },
    onSuccess: (_data, ids) => {
      addToast('success', `Acknowledged ${ids.length} alert(s)`);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
    onError: (err) => {
      addToast('error', err instanceof Error ? err.message : 'Acknowledge failed');
    },
  });

  // Selection helpers
  const unacknowledgedAlerts = alerts.filter((a) => !a.is_acknowledged);
  const allSelected = unacknowledgedAlerts.length > 0 && unacknowledgedAlerts.every((a) => selected.has(a.id));
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(unacknowledgedAlerts.map((a) => a.id)));
    }
  }, [allSelected, unacknowledgedAlerts]);

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

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Filters active?
  const hasActiveFilters = severity !== 'all' || alertType !== 'all' || status !== 'all' || dateFrom || dateTo;

  const clearFilters = useCallback(() => {
    setSeverity('all');
    setAlertType('all');
    setStatus('all');
    setDateFrom('');
    setDateTo('');
    resetPage();
  }, [resetPage]);

  // No site
  if (!activeSiteId) {
    return (
      <div>
        <h1 className="text-3xl font-bold text-surface-900 leading-tight mb-4">Alerts</h1>
        <EmptyState
          icon={Bell}
          title="No Site Selected"
          description="Please select a site from the header to view alerts."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-surface-900 leading-tight">Alerts</h1>
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-base text-surface-500">{selected.size} selected</span>
            <Button
              size="sm"
              variant="secondary"
              loading={acknowledgeMutation.isPending}
              onClick={() => acknowledgeMutation.mutate(Array.from(selected))}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Acknowledge Selected
            </Button>
          </div>
        )}
      </div>

      {/* New alerts banner */}
      {newAlertCount > 0 && (
        <button
          onClick={dismissBanner}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-primary-500/5 border border-primary-500/20 text-base font-medium text-primary-500 hover:bg-primary-500/10 transition-colors"
        >
          <Bell className="h-3.5 w-3.5" />
          {newAlertCount} new alert{newAlertCount > 1 ? 's' : ''} available — click to refresh
        </button>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Severity */}
        <select
          value={severity}
          onChange={(e) => {
            setSeverity(e.target.value as SeverityFilter);
            resetPage();
          }}
          className="h-10 w-[120px] px-2 rounded-xl border border-surface-300 card-bg text-base text-surface-600 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          {SEVERITY_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt === 'all' ? 'All Severity' : severityLabel(opt)}
            </option>
          ))}
        </select>

        {/* Type */}
        <select
          value={alertType}
          onChange={(e) => {
            setAlertType(e.target.value as TypeFilter);
            resetPage();
          }}
          className="h-10 w-[170px] px-2 rounded-xl border border-surface-300 card-bg text-base text-surface-600 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt === 'all' ? 'All Types' : typeLabel(opt)}
            </option>
          ))}
        </select>

        {/* Status toggle */}
        <div className="flex items-center border border-surface-300 rounded-xl overflow-hidden">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => {
                setStatus(opt);
                resetPage();
              }}
              className={clsx(
                'h-10 px-3 text-base font-medium transition-colors',
                status === opt
                  ? 'bg-surface-100 text-surface-900'
                  : 'text-surface-500 hover:text-surface-700 hover:bg-surface-50'
              )}
            >
              {opt === 'all' ? 'All' : opt === 'unacknowledged' ? 'Unack' : 'Ack'}
            </button>
          ))}
        </div>

        {/* Date from */}
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            resetPage();
          }}
          className="h-10 w-[140px] px-2 rounded-xl border border-surface-300 card-bg text-base text-surface-600 focus:outline-none focus:ring-1 focus:ring-primary-500"
          placeholder="From"
        />

        {/* Date to */}
        <input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            resetPage();
          }}
          className="h-10 w-[140px] px-2 rounded-xl border border-surface-300 card-bg text-base text-surface-600 focus:outline-none focus:ring-1 focus:ring-primary-500"
          placeholder="To"
        />

        {/* Clear */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="h-10 px-2 inline-flex items-center gap-1 rounded-xl text-base text-surface-500 hover:text-surface-700 hover:bg-surface-100"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" className="text-surface-400" />
        </div>
      )}

      {/* Empty */}
      {!isLoading && alerts.length === 0 && (
        <EmptyState
          icon={Bell}
          title={hasActiveFilters ? 'No Matching Alerts' : 'No Alerts'}
          description={
            hasActiveFilters
              ? 'Try adjusting your filters.'
              : 'No alerts have been recorded for this site yet.'
          }
          action={
            hasActiveFilters ? (
              <button
                onClick={clearFilters}
                className="h-10 px-3 rounded-xl border border-surface-300 text-base text-surface-600 hover:bg-surface-50"
              >
                Clear filters
              </button>
            ) : undefined
          }
        />
      )}

      {/* Table */}
      {!isLoading && alerts.length > 0 && (
        <div ref={tableRef} className="bryzos-card rounded-3xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-surface-50 border-b border-[var(--glass-border)]">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={toggleAll}
                    className="h-3.5 w-3.5 rounded border-surface-300 cursor-pointer"
                  />
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                  Severity
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider hidden md:table-cell">
                  Device
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider hidden sm:table-cell">
                  Type
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                  Message
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider w-[80px]">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {alerts.map((alert) => {
                const isExpanded = expanded.has(alert.id);
                return (
                  <AlertRow
                    key={alert.id}
                    alert={alert}
                    isExpanded={isExpanded}
                    isSelected={selected.has(alert.id)}
                    onToggleExpand={() => toggleExpand(alert.id)}
                    onToggleSelect={() => toggleOne(alert.id)}
                    deviceName={alert.device_id ? deviceNameMap.get(alert.device_id) : undefined}
                    onNavigateDevice={alert.device_id ? () => navigate(`/devices/${alert.device_id}`) : undefined}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!isLoading && total > PER_PAGE && (
        <div className="flex items-center justify-between">
          <span className="text-base text-surface-500">
            Showing {(page - 1) * PER_PAGE + 1}-{Math.min(page * PER_PAGE, total)} of {total}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="h-9 px-2 inline-flex items-center gap-1 rounded-xl text-base text-surface-600 hover:bg-surface-100 disabled:opacity-40 disabled:pointer-events-none"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </button>
            <span className="text-base text-surface-600 px-2">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="h-9 px-2 inline-flex items-center gap-1 rounded-xl text-base text-surface-600 hover:bg-surface-100 disabled:opacity-40 disabled:pointer-events-none"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alert table row (extracted to keep main component lean)
// ---------------------------------------------------------------------------

interface AlertRowProps {
  alert: Alert;
  isExpanded: boolean;
  isSelected: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
  deviceName?: string;
  onNavigateDevice?: () => void;
}

function AlertRow({ alert, isExpanded, isSelected, onToggleExpand, onToggleSelect, deviceName, onNavigateDevice }: AlertRowProps) {
  return (
    <>
      <tr
        onClick={onToggleExpand}
        className={clsx(
          'hover:bg-surface-50 transition-colors cursor-pointer',
          isExpanded && 'bg-surface-50'
        )}
      >
        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
          {!alert.is_acknowledged && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              className="h-3.5 w-3.5 rounded border-surface-300 cursor-pointer"
            />
          )}
        </td>
        <td className="px-3 py-2">
          <div className="text-base text-surface-700" title={formatDateTime(alert.created_at)}>
            {formatRelativeTime(alert.created_at)}
          </div>
        </td>
        <td className="px-3 py-2">
          <Badge variant={severityBadgeVariant(alert.severity)}>
            {severityLabel(alert.severity)}
          </Badge>
        </td>
        <td className="px-3 py-2 text-base hidden md:table-cell" onClick={(e) => e.stopPropagation()}>
          {alert.device_id ? (
            onNavigateDevice ? (
              <button
                onClick={onNavigateDevice}
                className="text-primary-600 hover:text-primary-700 hover:underline truncate max-w-[140px] block"
                title={deviceName || alert.device_id}
              >
                {deviceName || alert.device_id.slice(0, 8)}
              </button>
            ) : (
              <span className="text-surface-600 font-mono text-xs">{alert.device_id.slice(0, 8)}</span>
            )
          ) : (
            <span className="text-surface-400">--</span>
          )}
        </td>
        <td className="px-3 py-2 text-base text-surface-600 hidden sm:table-cell">
          {typeLabel(alert.type)}
        </td>
        <td className="px-3 py-2">
          <div className="text-base text-surface-800 truncate max-w-[280px]">
            {alert.message}
          </div>
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1">
            {alert.is_acknowledged ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                <CheckCircle2 className="h-3 w-3" />
                Ack
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                <AlertTriangle className="h-3 w-3" />
                Open
              </span>
            )}
            {isExpanded ? (
              <ChevronUp className="h-3.5 w-3.5 text-surface-400 ml-auto" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-surface-400 ml-auto" />
            )}
          </div>
        </td>
      </tr>
      {isExpanded && <AlertDetailRow alert={alert} />}
    </>
  );
}
