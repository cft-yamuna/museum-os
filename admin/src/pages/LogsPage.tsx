import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  FileText,
  Monitor,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { api } from '../lib/api';
import { useSiteStore } from '../stores/site';
import { formatDateTime } from '../lib/utils';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import type { AuditLog, Device } from '../lib/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PER_PAGE = 25;

type LogTab = 'audit' | 'device';

const AUDIT_ACTION_OPTIONS = [
  'all',
  'create',
  'update',
  'delete',
  'login',
  'logout',
  'assign',
  'unassign',
  'acknowledge',
  'deploy',
] as const;

const AUDIT_ENTITY_OPTIONS = [
  'all',
  'device',
  'content',
  'playlist',
  'schedule',
  'user',
  'site',
  'alert',
] as const;

type AuditActionFilter = (typeof AUDIT_ACTION_OPTIONS)[number];
type AuditEntityFilter = (typeof AUDIT_ENTITY_OPTIONS)[number];

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

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function userInitial(name: string | undefined): string {
  if (!name) return '?';
  return name.charAt(0).toUpperCase();
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface AuditLogsResponse {
  logs: AuditLog[];
  total: number;
  page: number;
  per_page: number;
}

// ---------------------------------------------------------------------------
// Audit log expanded detail
// ---------------------------------------------------------------------------

function AuditDetailRow({ log }: { log: AuditLog }) {
  return (
    <tr>
      <td colSpan={6} className="px-3 py-3 bg-surface-50">
        <div className="space-y-2">
          <div>
            <span className="text-xs font-medium text-surface-500 uppercase">Details (JSON)</span>
            <pre className="mt-1 p-2 rounded-xl bg-surface-100 text-xs text-surface-700 font-mono overflow-x-auto max-h-48">
              {log.details ? JSON.stringify(log.details, null, 2) : 'No details available'}
            </pre>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-base">
            <div>
              <span className="text-xs font-medium text-surface-500 uppercase">Log ID</span>
              <p className="text-surface-600 font-mono text-xs">{log.id}</p>
            </div>
            <div>
              <span className="text-xs font-medium text-surface-500 uppercase">User ID</span>
              <p className="text-surface-600 font-mono text-xs">{log.user_id || '--'}</p>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Audit Logs Tab
// ---------------------------------------------------------------------------

function AuditLogsTab({ siteId }: { siteId: string }) {
  const [action, setAction] = useState<AuditActionFilter>('all');
  const [entityType, setEntityType] = useState<AuditEntityFilter>('all');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const resetPage = useCallback(() => setPage(1), []);

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', siteId, action, entityType, search, dateFrom, dateTo, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('site_id', siteId);
      params.set('page', String(page));
      params.set('per_page', String(PER_PAGE));

      if (action !== 'all') params.set('action', action);
      if (entityType !== 'all') params.set('entity_type', entityType);
      if (search) params.set('search', search);
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);

      return api.get<AuditLogsResponse>(`/audit-logs?${params.toString()}`);
    },
    enabled: !!siteId,
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

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

  const hasActiveFilters = action !== 'all' || entityType !== 'all' || search || dateFrom || dateTo;

  const clearFilters = useCallback(() => {
    setAction('all');
    setEntityType('all');
    setSearch('');
    setDateFrom('');
    setDateTo('');
    resetPage();
  }, [resetPage]);

  const downloadCsv = useCallback(async () => {
    const params = new URLSearchParams();
    params.set('site_id', siteId);
    if (action !== 'all') params.set('action', action);
    if (entityType !== 'all') params.set('entity_type', entityType);
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    try {
      const blob = await api.getBlob(`/audit-logs/export.csv?${params.toString()}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'audit-logs.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // surfaced by the network layer; nothing to do here
    }
  }, [siteId, action, entityType, dateFrom, dateTo]);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-surface-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            className="h-10 w-full pl-8 pr-3 rounded-xl border border-surface-300 card-bg text-base text-surface-700 placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-primary-500"
            placeholder="Search logs..."
          />
        </div>

        {/* Action */}
        <select
          value={action}
          onChange={(e) => {
            setAction(e.target.value as AuditActionFilter);
            resetPage();
          }}
          className="h-10 w-[130px] px-2 rounded-xl border border-surface-300 card-bg text-base text-surface-600 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          {AUDIT_ACTION_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt === 'all' ? 'All Actions' : capitalize(opt)}
            </option>
          ))}
        </select>

        {/* Entity type */}
        <select
          value={entityType}
          onChange={(e) => {
            setEntityType(e.target.value as AuditEntityFilter);
            resetPage();
          }}
          className="h-10 w-[130px] px-2 rounded-xl border border-surface-300 card-bg text-base text-surface-600 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          {AUDIT_ENTITY_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt === 'all' ? 'All Entities' : capitalize(opt)}
            </option>
          ))}
        </select>

        {/* Date from */}
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            resetPage();
          }}
          className="h-10 w-[140px] px-2 rounded-xl border border-surface-300 card-bg text-base text-surface-600 focus:outline-none focus:ring-1 focus:ring-primary-500"
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

        {/* Export CSV */}
        <button
          onClick={downloadCsv}
          className="ml-auto h-10 px-3 inline-flex items-center gap-1.5 rounded-xl border border-surface-300 card-bg text-base font-medium text-surface-700 hover:bg-surface-50"
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" className="text-surface-400" />
        </div>
      )}

      {/* Empty */}
      {!isLoading && logs.length === 0 && (
        <EmptyState
          icon={FileText}
          title={hasActiveFilters ? 'No Matching Logs' : 'No Audit Logs'}
          description={
            hasActiveFilters
              ? 'Try adjusting your search or filters.'
              : 'No audit logs have been recorded for this site yet.'
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
      {!isLoading && logs.length > 0 && (
        <div className="bryzos-card rounded-3xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-surface-50 border-b border-[var(--glass-border)]">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                  Action
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider hidden sm:table-cell">
                  Entity Type
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider hidden md:table-cell">
                  Entity ID
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider w-10">
                  {/* expand icon column */}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {logs.map((log) => {
                const isExpanded = expanded.has(log.id);
                return (
                  <AuditLogRow
                    key={log.id}
                    log={log}
                    isExpanded={isExpanded}
                    onToggle={() => toggleExpand(log.id)}
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
// Audit log row
// ---------------------------------------------------------------------------

interface AuditLogRowProps {
  log: AuditLog;
  isExpanded: boolean;
  onToggle: () => void;
}

function AuditLogRow({ log, isExpanded, onToggle }: AuditLogRowProps) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={clsx(
          'hover:bg-surface-50 transition-colors cursor-pointer',
          isExpanded && 'bg-surface-50'
        )}
      >
        <td className="px-3 py-2">
          <div className="text-base text-surface-700" title={formatDateTime(log.created_at)}>
            {formatRelativeTime(log.created_at)}
          </div>
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-primary-500/10 text-primary-500 flex items-center justify-center text-sm font-semibold shrink-0">
              {userInitial(log.user_name)}
            </div>
            <span className="text-base text-surface-800 truncate max-w-[120px]">
              {log.user_name || 'System'}
            </span>
          </div>
        </td>
        <td className="px-3 py-2">
          <Badge variant="neutral">{capitalize(log.action)}</Badge>
        </td>
        <td className="px-3 py-2 text-base text-surface-600 hidden sm:table-cell">
          {log.entity_type ? capitalize(log.entity_type) : '--'}
        </td>
        <td className="px-3 py-2 hidden md:table-cell">
          {log.entity_id ? (
            <span className="font-mono text-xs text-surface-500">{log.entity_id.slice(0, 8)}</span>
          ) : (
            <span className="text-base text-surface-400">--</span>
          )}
        </td>
        <td className="px-3 py-2">
          {isExpanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-surface-400" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-surface-400" />
          )}
        </td>
      </tr>
      {isExpanded && <AuditDetailRow log={log} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Device Logs Tab
// ---------------------------------------------------------------------------

interface DeviceLog {
  id: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  created_at: string;
}

type DeviceLogLevel = 'all' | 'error' | 'warn' | 'info' | 'debug';

const LEVEL_BADGE_STYLES: Record<DeviceLog['level'], string> = {
  error: 'bg-red-500/5 text-red-500',
  warn: 'bg-amber-500/5 text-amber-500',
  info: 'bg-sky-500/5 text-sky-500',
  debug: 'bg-surface-100 text-surface-500',
};

function DeviceLogsTab({ siteId }: { siteId: string }) {
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [levelFilter, setLevelFilter] = useState<DeviceLogLevel>('all');

  const { data: devices, isLoading: devicesLoading } = useQuery({
    queryKey: ['devices', siteId],
    queryFn: () => api.get<Device[]>(`/devices?site_id=${siteId}`),
    enabled: !!siteId,
  });

  const { data: logs, isLoading: logsLoading } = useQuery({
    queryKey: ['device-logs', selectedDeviceId],
    queryFn: () => api.get<DeviceLog[]>(`/devices/${selectedDeviceId}/logs`),
    enabled: !!selectedDeviceId,
  });

  const filteredLogs =
    levelFilter === 'all'
      ? logs ?? []
      : (logs ?? []).filter((l) => l.level === levelFilter);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Device selector */}
        <select
          value={selectedDeviceId}
          onChange={(e) => setSelectedDeviceId(e.target.value)}
          className="h-10 w-[200px] px-3.5 rounded-xl border border-surface-300 card-bg text-base text-surface-600 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          <option value="">Select a device…</option>
          {(devices ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.display_name}
            </option>
          ))}
        </select>

        {/* Level filter */}
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value as DeviceLogLevel)}
          className="h-10 w-[200px] px-3.5 rounded-xl border border-surface-300 card-bg text-base text-surface-600 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          <option value="all">All Levels</option>
          <option value="error">Error</option>
          <option value="warn">Warn</option>
          <option value="info">Info</option>
          <option value="debug">Debug</option>
        </select>
      </div>

      {/* Loading devices */}
      {devicesLoading && (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" className="text-surface-400" />
        </div>
      )}

      {/* No device selected */}
      {!devicesLoading && !selectedDeviceId && (
        <EmptyState
          icon={Monitor}
          title="Select a Device"
          description="Select a device to view its logs."
        />
      )}

      {/* Loading logs */}
      {selectedDeviceId && logsLoading && (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" className="text-surface-400" />
        </div>
      )}

      {/* No logs */}
      {selectedDeviceId && !logsLoading && filteredLogs.length === 0 && (
        <EmptyState
          icon={Monitor}
          title="No Logs Available"
          description="No logs available for this device."
        />
      )}

      {/* Logs table */}
      {selectedDeviceId && !logsLoading && filteredLogs.length > 0 && (
        <div className="bryzos-card rounded-3xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-surface-50 border-b border-[var(--glass-border)]">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider w-[80px]">
                  Level
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                  Message
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider w-[160px]">
                  Timestamp
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-surface-50 transition-colors">
                  <td className="px-3 py-2">
                    <span
                      className={clsx(
                        'inline-flex px-1.5 py-0.5 rounded text-sm font-medium',
                        LEVEL_BADGE_STYLES[log.level]
                      )}
                    >
                      {log.level.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-base text-surface-700">
                    {log.message}
                  </td>
                  <td
                    className="px-3 py-2 text-base text-surface-500"
                    title={formatDateTime(log.created_at)}
                  >
                    {formatRelativeTime(log.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main LogsPage
// ---------------------------------------------------------------------------

export function LogsPage() {
  const activeSiteId = useSiteStore((s) => s.activeSiteId);
  const [tab, setTab] = useState<LogTab>('audit');

  if (!activeSiteId) {
    return (
      <div>
        <h1 className="text-3xl font-bold text-surface-900 leading-tight mb-4">Logs</h1>
        <EmptyState
          icon={FileText}
          title="No Site Selected"
          description="Please select a site from the header to view logs."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with tabs */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-surface-900 leading-tight">Logs</h1>
      </div>

      {/* Tab bar */}
      <div className="flex items-center border border-surface-300 rounded-xl overflow-hidden w-fit">
        <button
          onClick={() => setTab('audit')}
          className={clsx(
            'h-10 px-4 text-base font-medium transition-colors inline-flex items-center gap-1.5',
            tab === 'audit'
              ? 'bg-surface-100 text-surface-900'
              : 'text-surface-500 hover:text-surface-700 hover:bg-surface-50'
          )}
        >
          <FileText className="h-3.5 w-3.5" />
          Audit Logs
        </button>
        <button
          onClick={() => setTab('device')}
          className={clsx(
            'h-10 px-4 text-base font-medium transition-colors inline-flex items-center gap-1.5',
            tab === 'device'
              ? 'bg-surface-100 text-surface-900'
              : 'text-surface-500 hover:text-surface-700 hover:bg-surface-50'
          )}
        >
          <Monitor className="h-3.5 w-3.5" />
          Device Logs
        </button>
      </div>

      {/* Tab content */}
      {tab === 'audit' && <AuditLogsTab siteId={activeSiteId} />}
      {tab === 'device' && <DeviceLogsTab siteId={activeSiteId} />}
    </div>
  );
}
