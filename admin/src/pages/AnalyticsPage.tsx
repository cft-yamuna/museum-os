import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, Cpu, MonitorCheck, Thermometer } from 'lucide-react';
import clsx from 'clsx';
import { api } from '../lib/api';
import { useSiteStore } from '../stores/site';
import { Spinner } from '../components/ui/Spinner';
import type { AnalyticsOverview, HealthTimeseries, ZoneHealth } from '../lib/types';

type Metric = 'avg_cpu' | 'avg_mem' | 'avg_temp';

const METRICS: { key: Metric; label: string; unit: string }[] = [
  { key: 'avg_cpu', label: 'CPU', unit: '%' },
  { key: 'avg_mem', label: 'Memory', unit: '%' },
  { key: 'avg_temp', label: 'Temp', unit: '°C' },
];

function formatHour(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:00`;
}

/** Color a zone tile by health percentage. */
function healthTone(pct: number): string {
  if (pct >= 90) return 'var(--status-online)';
  if (pct >= 60) return 'var(--status-restarting)';
  if (pct >= 30) return 'var(--status-error)';
  return 'var(--status-offline)';
}

export function AnalyticsPage() {
  const activeSiteId = useSiteStore((s) => s.activeSiteId);
  const [hours, setHours] = useState(24);
  const [metric, setMetric] = useState<Metric>('avg_cpu');

  const overviewQuery = useQuery({
    queryKey: ['analytics-overview', activeSiteId],
    queryFn: () => api.get<AnalyticsOverview>(`/analytics/overview?site_id=${activeSiteId}`),
    enabled: !!activeSiteId,
    refetchInterval: 30_000,
  });

  const seriesQuery = useQuery({
    queryKey: ['analytics-series', activeSiteId, hours],
    queryFn: () =>
      api.get<HealthTimeseries>(`/analytics/health-timeseries?site_id=${activeSiteId}&hours=${hours}`),
    enabled: !!activeSiteId,
    refetchInterval: 60_000,
  });

  const zonesQuery = useQuery({
    queryKey: ['analytics-zones', activeSiteId],
    queryFn: () => api.get<{ zones: ZoneHealth[] }>(`/analytics/zones?site_id=${activeSiteId}`),
    enabled: !!activeSiteId,
    refetchInterval: 30_000,
  });

  const overview = overviewQuery.data;
  const buckets = seriesQuery.data?.buckets ?? [];
  const zones = zonesQuery.data?.zones ?? [];

  const activeMetric = METRICS.find((m) => m.key === metric)!;
  const maxVal = useMemo(() => {
    const vals = buckets.map((b) => Number(b[metric]) || 0);
    const max = Math.max(...vals, metric === 'avg_temp' ? 90 : 100);
    return max <= 0 ? 1 : max;
  }, [buckets, metric]);

  if (!activeSiteId) {
    return <div className="p-6 text-surface-500">Select a site to view analytics.</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-surface-950">Analytics</h1>
        <p className="text-sm text-surface-500">Fleet health, trends and per-zone status.</p>
      </div>

      {/* KPI strip */}
      {overviewQuery.isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : overview ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi
            icon={MonitorCheck}
            label="Devices online"
            value={`${overview.status.online || 0}/${overview.total}`}
            sub={`${overview.online_pct}% online`}
            tone="var(--status-online)"
          />
          <Kpi
            icon={Cpu}
            label="Avg CPU"
            value={overview.avg_cpu !== null ? `${overview.avg_cpu}%` : '—'}
            sub={overview.avg_mem !== null ? `${overview.avg_mem}% memory` : 'no data'}
            tone="var(--status-restarting)"
          />
          <Kpi
            icon={Thermometer}
            label="Avg temp"
            value={overview.avg_temp !== null ? `${overview.avg_temp}°C` : '—'}
            sub="across reporting devices"
            tone="var(--status-error)"
          />
          <Kpi
            icon={AlertTriangle}
            label="Open alerts"
            value={String(overview.alerts.total)}
            sub={`${overview.alerts.critical} critical · ${overview.alerts.high} high`}
            tone="var(--status-offline)"
          />
        </div>
      ) : null}

      {/* Status breakdown */}
      {overview ? (
        <div className="admin-card flex flex-wrap gap-x-8 gap-y-3 p-4">
          {(['online', 'offline', 'unavailable', 'error', 'restarting'] as const).map((s) => (
            <div key={s} className="flex items-center gap-2">
              <span className={clsx('status-dot', `status-dot--${s}`)} />
              <span className="text-sm capitalize text-surface-600">{s}</span>
              <span className="font-data text-sm font-semibold text-surface-950">
                {overview.status[s] || 0}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Hourly health chart */}
      <div className="admin-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-surface-500" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-surface-500">
              Hourly health
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-md border border-[var(--glass-border)]">
              {METRICS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMetric(m.key)}
                  className={clsx(
                    'px-3 py-1 text-xs font-semibold',
                    metric === m.key
                      ? 'bg-primary-600 dark:bg-primary-300 text-white'
                      : 'text-surface-600 hover:bg-[var(--glass-bg-hover)]'
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <select
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="admin-control px-2 text-xs"
            >
              <option value={6}>6h</option>
              <option value={24}>24h</option>
              <option value={72}>3d</option>
              <option value={168}>7d</option>
            </select>
          </div>
        </div>

        {seriesQuery.isLoading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : buckets.length === 0 ? (
          <p className="py-10 text-center text-sm text-surface-500">
            No health samples in this window yet.
          </p>
        ) : (
          <BarChart buckets={buckets} metric={metric} unit={activeMetric.unit} maxVal={maxVal} />
        )}
      </div>

      {/* Zone heatmap */}
      <div className="admin-card p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-surface-500">
          Zone health
        </h2>
        {zonesQuery.isLoading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : zones.length === 0 ? (
          <p className="py-6 text-center text-sm text-surface-500">
            No zones defined. Create device groups of type “zone” to see them here.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {zones.map((z) => (
              <div
                key={z.id}
                className="rounded-lg border border-[var(--glass-border)] p-3"
                style={{ background: 'var(--glass-bg)' }}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate text-sm font-medium text-surface-900">{z.name}</span>
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: healthTone(z.health_pct) }}
                  />
                </div>
                <div className="mt-2 font-data text-2xl font-semibold text-surface-950">
                  {z.health_pct}%
                </div>
                <div className="mt-1 text-xs text-surface-500">
                  {z.online}/{z.total} online
                  {z.unavailable > 0 ? ` · ${z.unavailable} unavailable` : ''}
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--glass-bg-hover)]">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${z.health_pct}%`, background: healthTone(z.health_pct) }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  sub: string;
  tone: string;
}) {
  return (
    <div className="admin-card p-4" style={{ borderLeft: `3px solid ${tone}` }}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-surface-500">
        <Icon className="h-4 w-4" style={{ color: tone }} />
        {label}
      </div>
      <div className="mt-2 font-data text-3xl font-semibold text-surface-950">{value}</div>
      <div className="mt-1 text-xs text-surface-500">{sub}</div>
    </div>
  );
}

function BarChart({
  buckets,
  metric,
  unit,
  maxVal,
}: {
  buckets: HealthTimeseries['buckets'];
  metric: Metric;
  unit: string;
  maxVal: number;
}) {
  const width = 720;
  const height = 200;
  const padBottom = 22;
  const padLeft = 28;
  const innerW = width - padLeft;
  const innerH = height - padBottom;
  const n = buckets.length;
  const slot = innerW / Math.max(n, 1);
  const barW = Math.max(2, Math.min(28, slot * 0.6));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Hourly health chart">
      {/* gridlines */}
      {[0, 0.25, 0.5, 0.75, 1].map((g) => {
        const y = innerH - g * innerH;
        return (
          <g key={g}>
            <line x1={padLeft} y1={y} x2={width} y2={y} stroke="var(--glass-border)" strokeWidth={1} />
            <text x={0} y={y + 4} fontSize={10} fill="var(--theme-surface-500)">
              {Math.round(maxVal * g)}
            </text>
          </g>
        );
      })}
      {buckets.map((b, i) => {
        const v = Number(b[metric]) || 0;
        const h = (v / maxVal) * innerH;
        const x = padLeft + i * slot + (slot - barW) / 2;
        const y = innerH - h;
        const showLabel = n <= 12 || i % Math.ceil(n / 12) === 0;
        return (
          <g key={b.bucket}>
            <rect x={x} y={y} width={barW} height={Math.max(0, h)} rx={2} fill="var(--accent-cyan)">
              <title>{`${formatHour(b.bucket)} — ${v}${unit} (${b.samples} samples)`}</title>
            </rect>
            {showLabel ? (
              <text
                x={x + barW / 2}
                y={height - 6}
                fontSize={9}
                textAnchor="middle"
                fill="var(--theme-surface-500)"
              >
                {formatHour(b.bucket)}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
