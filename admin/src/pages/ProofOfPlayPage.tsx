import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PlayCircle, Download, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { useSiteStore } from '../stores/site';
import { formatDateTime } from '../lib/utils';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import type { Device } from '../lib/types';

const PER_PAGE = 25;

const SOURCE_OPTIONS = ['all', 'app', 'slideshow', 'fallback', 'item'] as const;
type SourceFilter = (typeof SOURCE_OPTIONS)[number];

interface PlayEvent {
  id: string;
  played_at: string;
  source: string;
  template_type: string | null;
  title: string | null;
  content_url: string | null;
  content_id: string | null;
  playlist_id: string | null;
  duration_sec: number | null;
  device_name: string | null;
  app_name: string | null;
}

interface PlayListResponse {
  events: PlayEvent[];
  total: number;
  page: number;
  per_page: number;
}

interface PlaySummary {
  total: number;
  bySource: { source: string; count: number }[];
  topContent: { label: string; count: number }[];
}

const SELECT_CLS =
  'h-10 px-2 rounded-xl border border-surface-300 card-bg text-base text-surface-600 focus:outline-none focus:ring-1 focus:ring-primary-500';

function contentLabel(e: PlayEvent): string {
  return e.title || e.app_name || e.template_type || 'Unknown';
}

const SOURCE_BADGE: Record<string, 'info' | 'success' | 'warning' | 'neutral' | 'danger'> = {
  app: 'info',
  slideshow: 'success',
  fallback: 'warning',
  item: 'neutral',
};

export function ProofOfPlayPage() {
  const activeSiteId = useSiteStore((s) => s.activeSiteId);
  const [source, setSource] = useState<SourceFilter>('all');
  const [deviceId, setDeviceId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const resetPage = useCallback(() => setPage(1), []);
  const siteId = activeSiteId || '';

  const { data: devices } = useQuery({
    queryKey: ['devices', siteId],
    queryFn: () => api.get<Device[]>(`/devices?site_id=${siteId}`),
    enabled: !!siteId,
  });

  const { data: summary } = useQuery({
    queryKey: ['proof-of-play-summary', siteId, dateFrom, dateTo],
    queryFn: () => {
      const params = new URLSearchParams({ site_id: siteId });
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      return api.get<PlaySummary>(`/proof-of-play/summary?${params.toString()}`);
    },
    enabled: !!siteId,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['proof-of-play', siteId, source, deviceId, dateFrom, dateTo, page],
    queryFn: () => {
      const params = new URLSearchParams({ site_id: siteId, page: String(page), per_page: String(PER_PAGE) });
      if (source !== 'all') params.set('source', source);
      if (deviceId) params.set('device_id', deviceId);
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      return api.get<PlayListResponse>(`/proof-of-play?${params.toString()}`);
    },
    enabled: !!siteId,
  });

  const events = data?.events ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const hasFilters = source !== 'all' || deviceId || dateFrom || dateTo;

  const clearFilters = useCallback(() => {
    setSource('all');
    setDeviceId('');
    setDateFrom('');
    setDateTo('');
    resetPage();
  }, [resetPage]);

  const downloadCsv = useCallback(async () => {
    const params = new URLSearchParams({ site_id: siteId });
    if (source !== 'all') params.set('source', source);
    if (deviceId) params.set('device_id', deviceId);
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    try {
      const blob = await api.getBlob(`/proof-of-play/export.csv?${params.toString()}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'proof-of-play.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // surfaced by the network layer
    }
  }, [siteId, source, deviceId, dateFrom, dateTo]);

  if (!activeSiteId) {
    return (
      <div>
        <h1 className="text-3xl font-bold text-surface-900 leading-tight mb-4">Proof of Play</h1>
        <EmptyState icon={PlayCircle} title="No Site Selected" description="Select a site from the header to view proof of play." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold text-surface-900 leading-tight">Proof of Play</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="bryzos-card rounded-3xl p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-surface-400">Total plays{(dateFrom || dateTo) ? ' (range)' : ''}</div>
          <div className="mt-1 text-3xl font-bold text-surface-900">{summary?.total ?? '—'}</div>
        </div>
        <div className="bryzos-card rounded-3xl p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-surface-400">By source</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(summary?.bySource ?? []).length === 0 && <span className="text-sm text-surface-400">No data</span>}
            {(summary?.bySource ?? []).map((s) => (
              <Badge key={s.source} variant={SOURCE_BADGE[s.source] || 'neutral'}>
                {s.source}: {s.count}
              </Badge>
            ))}
          </div>
        </div>
        <div className="bryzos-card rounded-3xl p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-surface-400">Top content</div>
          <ul className="mt-2 space-y-0.5 text-sm text-surface-600">
            {(summary?.topContent ?? []).slice(0, 5).map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex justify-between gap-2">
                <span className="truncate">{c.label}</span>
                <span className="shrink-0 font-semibold text-surface-800">{c.count}</span>
              </li>
            ))}
            {(summary?.topContent ?? []).length === 0 && <li className="text-surface-400">No data</li>}
          </ul>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={deviceId} onChange={(e) => { setDeviceId(e.target.value); resetPage(); }} className={`${SELECT_CLS} w-[180px]`}>
          <option value="">All devices</option>
          {(devices ?? []).map((d) => (
            <option key={d.id} value={d.id}>{d.display_name}</option>
          ))}
        </select>

        <select value={source} onChange={(e) => { setSource(e.target.value as SourceFilter); resetPage(); }} className={`${SELECT_CLS} w-[140px]`}>
          {SOURCE_OPTIONS.map((s) => (
            <option key={s} value={s}>{s === 'all' ? 'All sources' : s}</option>
          ))}
        </select>

        <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); resetPage(); }} className={`${SELECT_CLS} w-[140px]`} />
        <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); resetPage(); }} className={`${SELECT_CLS} w-[140px]`} />

        {hasFilters && (
          <button onClick={clearFilters} className="h-10 px-2 inline-flex items-center gap-1 rounded-xl text-base text-surface-500 hover:text-surface-700 hover:bg-surface-100">
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}

        <button onClick={downloadCsv} className="ml-auto h-10 px-3 inline-flex items-center gap-1.5 rounded-xl border border-surface-300 card-bg text-base font-medium text-surface-700 hover:bg-surface-50">
          <Download className="h-3.5 w-3.5" /> Export CSV
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16"><Spinner size="lg" className="text-surface-400" /></div>
      )}

      {/* Empty */}
      {!isLoading && events.length === 0 && (
        <EmptyState
          icon={PlayCircle}
          title={hasFilters ? 'No Matching Plays' : 'No Proof of Play Yet'}
          description={hasFilters ? 'Try adjusting your filters.' : 'Play events appear here as devices show content.'}
        />
      )}

      {/* Table */}
      {!isLoading && events.length > 0 && (
        <div className="bryzos-card rounded-3xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-surface-50 border-b border-[var(--glass-border)]">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider w-[170px]">Time</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">Content</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider hidden sm:table-cell">Device</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider w-[110px]">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {events.map((e) => (
                <tr key={e.id} className="hover:bg-surface-50 transition-colors">
                  <td className="px-3 py-2 text-base text-surface-600">{formatDateTime(e.played_at)}</td>
                  <td className="px-3 py-2 text-base text-surface-800">
                    <span className="truncate">{contentLabel(e)}</span>
                    {e.template_type && <span className="ml-2 text-xs text-surface-400">{e.template_type}</span>}
                  </td>
                  <td className="px-3 py-2 text-base text-surface-600 hidden sm:table-cell">{e.device_name || '--'}</td>
                  <td className="px-3 py-2">
                    <Badge variant={SOURCE_BADGE[e.source] || 'neutral'}>{e.source}</Badge>
                  </td>
                </tr>
              ))}
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
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="h-9 px-2 inline-flex items-center gap-1 rounded-xl text-base text-surface-600 hover:bg-surface-100 disabled:opacity-40 disabled:pointer-events-none">
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </button>
            <span className="text-base text-surface-600 px-2">{page} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="h-9 px-2 inline-flex items-center gap-1 rounded-xl text-base text-surface-600 hover:bg-surface-100 disabled:opacity-40 disabled:pointer-events-none">
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
