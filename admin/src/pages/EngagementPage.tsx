import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Download,
  Footprints,
  MousePointerClick,
  Timer,
  TrendingUp,
} from 'lucide-react';
import clsx from 'clsx';
import { api } from '../lib/api';
import { useSiteStore } from '../stores/site';
import { Spinner } from '../components/ui/Spinner';
import type {
  BusiestHour,
  EngagementHeatmap,
  EngagementSummary,
  ExhibitEngagement,
} from '../lib/types';

const WINDOWS = [
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '3d', hours: 72 },
  { label: '7d', hours: 168 },
  { label: '30d', hours: 720 },
];

type ExhibitMetric = 'interactions' | 'avg_dwell_sec';

const EXHIBIT_METRICS: { key: ExhibitMetric; label: string }[] = [
  { key: 'interactions', label: 'Interactions' },
  { key: 'avg_dwell_sec', label: 'Avg dwell' },
];

function formatDwell(sec: number): string {
  if (!sec || sec <= 0) return '0s';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatHour(h: number | null): string {
  if (h === null || h === undefined) return '—';
  return `${String(h).padStart(2, '0')}:00`;
}

/** Intensity colour for a heatmap cell, scaled 0..max. */
function heatTone(value: number, max: number): string {
  if (max <= 0 || value <= 0) return 'var(--glass-bg-hover)';
  const pct = Math.round(12 + (value / max) * 88);
  return `color-mix(in srgb, var(--accent-cyan) ${pct}%, transparent)`;
}

export function EngagementPage() {
  const activeSiteId = useSiteStore((s) => s.activeSiteId);
  const [hours, setHours] = useState(24);
  const [exhibitMetric, setExhibitMetric] = useState<ExhibitMetric>('interactions');
  const siteId = activeSiteId || '';

  const summaryQuery = useQuery({
    queryKey: ['engagement-summary', siteId, hours],
    queryFn: () => api.get<EngagementSummary>(`/engagement/summary?site_id=${siteId}&hours=${hours}`),
    enabled: !!siteId,
    refetchInterval: 60_000,
  });

  const exhibitsQuery = useQuery({
    queryKey: ['engagement-exhibits', siteId, hours],
    queryFn: () =>
      api.get<{ exhibits: ExhibitEngagement[] }>(
        `/engagement/dwell-by-exhibit?site_id=${siteId}&hours=${hours}`
      ),
    enabled: !!siteId,
    refetchInterval: 60_000,
  });

  const heatmapQuery = useQuery({
    queryKey: ['engagement-heatmap', siteId, hours],
    queryFn: () => api.get<EngagementHeatmap>(`/engagement/heatmap?site_id=${siteId}&hours=${hours}`),
    enabled: !!siteId,
    refetchInterval: 60_000,
  });

  const hoursQuery = useQuery({
    queryKey: ['engagement-busiest', siteId, hours],
    queryFn: () =>
      api.get<{ curve: BusiestHour[] }>(`/engagement/busiest-hours?site_id=${siteId}&hours=${hours}`),
    enabled: !!siteId,
    refetchInterval: 60_000,
  });

  const summary = summaryQuery.data;
  const exhibits = useMemo(() => exhibitsQuery.data?.exhibits ?? [], [exhibitsQuery.data]);
  const heatmap = heatmapQuery.data;
  const curve = hoursQuery.data?.curve ?? [];

  const exhibitMax = useMemo(
    () => Math.max(1, ...exhibits.map((e) => Number(e[exhibitMetric]) || 0)),
    [exhibits, exhibitMetric]
  );
  const heatMax = useMemo(() => {
    if (!heatmap) return 0;
    let max = 0;
    for (const row of Object.values(heatmap.cells)) {
      for (const v of row) if (v > max) max = v;
    }
    return max;
  }, [heatmap]);
  const curveMax = useMemo(() => Math.max(1, ...curve.map((c) => c.interactions)), [curve]);

  const downloadCsv = useCallback(async () => {
    try {
      const blob = await api.getBlob(`/engagement/export.csv?site_id=${siteId}&hours=${hours}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'engagement.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // surfaced by the network layer
    }
  }, [siteId, hours]);

  if (!activeSiteId) {
    return <div className="p-6 text-surface-500">Select a site to view visitor engagement.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-surface-950">Engagement</h1>
          <p className="text-sm text-surface-500">
            Visitor dwell, interactions and busiest times — from real presence sensors and touches.
            Anonymous aggregate counts only.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="admin-control px-2 text-xs"
          >
            {WINDOWS.map((w) => (
              <option key={w.hours} value={w.hours}>
                {w.label}
              </option>
            ))}
          </select>
          <button
            onClick={downloadCsv}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--glass-border)] px-3 text-xs font-medium text-surface-700 hover:bg-[var(--glass-bg-hover)]"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </div>
      </div>

      {/* KPI strip */}
      {summaryQuery.isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : summary ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi
            icon={MousePointerClick}
            label="Interactions"
            value={summary.total_interactions.toLocaleString()}
            sub="taps & navigations"
            tone="var(--accent-cyan)"
          />
          <Kpi
            icon={Timer}
            label="Avg dwell"
            value={formatDwell(summary.avg_dwell_sec)}
            sub="per occupancy session"
            tone="var(--status-online)"
          />
          <Kpi
            icon={Footprints}
            label="Occupancy sessions"
            value={summary.total_sessions.toLocaleString()}
            sub="presence approaches"
            tone="var(--status-restarting)"
          />
          <Kpi
            icon={TrendingUp}
            label="Busiest hour"
            value={formatHour(summary.busiest_hour)}
            sub={`local time (${summary.tz})`}
            tone="var(--status-error)"
          />
        </div>
      ) : null}

      {/* Per-exhibit engagement */}
      <div className="admin-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-surface-500">
            By exhibit
          </h2>
          <div className="flex overflow-hidden rounded-md border border-[var(--glass-border)]">
            {EXHIBIT_METRICS.map((m) => (
              <button
                key={m.key}
                onClick={() => setExhibitMetric(m.key)}
                className={clsx(
                  'px-3 py-1 text-xs font-semibold',
                  exhibitMetric === m.key
                    ? 'bg-primary-600 dark:bg-primary-300 text-white'
                    : 'text-surface-600 hover:bg-[var(--glass-bg-hover)]'
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {exhibitsQuery.isLoading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : exhibits.length === 0 ? (
          <p className="py-6 text-center text-sm text-surface-500">
            No zones defined, or no engagement recorded yet. Create device groups of type “zone” and
            attach a presence sensor or touch template.
          </p>
        ) : (
          <div className="space-y-2.5">
            {exhibits.map((e) => {
              const val = Number(e[exhibitMetric]) || 0;
              const display = exhibitMetric === 'avg_dwell_sec' ? formatDwell(val) : val.toLocaleString();
              return (
                <div key={e.zone_id} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 truncate text-sm text-surface-800" title={e.name}>
                    {e.name}
                  </span>
                  <div className="h-5 flex-1 overflow-hidden rounded bg-[var(--glass-bg-hover)]">
                    <div
                      className="h-full rounded"
                      style={{
                        width: `${Math.max(2, (val / exhibitMax) * 100)}%`,
                        background: e.color || 'var(--accent-cyan)',
                      }}
                    />
                  </div>
                  <span className="w-28 shrink-0 text-right font-data text-sm text-surface-700">
                    {display}
                    <span className="ml-1 text-xs text-surface-400">
                      {exhibitMetric === 'avg_dwell_sec'
                        ? `${e.interactions} taps`
                        : `${formatDwell(e.avg_dwell_sec)}`}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Zone x hour-of-day heatmap */}
      <div className="admin-card p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-surface-500">
          Heatmap — interactions by zone &amp; hour
        </h2>
        {heatmapQuery.isLoading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : !heatmap || heatmap.zones.length === 0 ? (
          <p className="py-6 text-center text-sm text-surface-500">No zones to display.</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              {/* hour axis */}
              <div className="mb-1 flex items-center gap-2">
                <span className="w-28 shrink-0" />
                <div className="flex flex-1 gap-0.5">
                  {heatmap.hour_labels.map((h) => (
                    <div key={h} className="flex-1 text-center text-[9px] text-surface-400">
                      {h % 3 === 0 ? h : ''}
                    </div>
                  ))}
                </div>
              </div>
              {heatmap.zones.map((z) => (
                <div key={z.id} className="mb-0.5 flex items-center gap-2">
                  <span className="w-28 shrink-0 truncate text-xs text-surface-700" title={z.name}>
                    {z.name}
                  </span>
                  <div className="flex flex-1 gap-0.5">
                    {(heatmap.cells[z.id] ?? []).map((v, h) => (
                      <div
                        key={h}
                        className="h-5 flex-1 rounded-[2px]"
                        style={{ background: heatTone(v, heatMax) }}
                        title={`${z.name} · ${formatHour(h)} — ${v} interactions`}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Hourly engagement curve */}
      <div className="admin-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Activity className="h-4 w-4 text-surface-500" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-surface-500">
            Interactions by hour of day
          </h2>
        </div>
        {hoursQuery.isLoading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : curve.every((c) => c.interactions === 0) ? (
          <p className="py-6 text-center text-sm text-surface-500">No interactions in this window yet.</p>
        ) : (
          <HourCurve curve={curve} max={curveMax} />
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

function HourCurve({ curve, max }: { curve: BusiestHour[]; max: number }) {
  const width = 720;
  const height = 200;
  const padBottom = 22;
  const padLeft = 28;
  const innerW = width - padLeft;
  const innerH = height - padBottom;
  const slot = innerW / 24;
  const barW = Math.max(4, Math.min(24, slot * 0.62));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Interactions by hour of day">
      {[0, 0.25, 0.5, 0.75, 1].map((g) => {
        const y = innerH - g * innerH;
        return (
          <g key={g}>
            <line x1={padLeft} y1={y} x2={width} y2={y} stroke="var(--glass-border)" strokeWidth={1} />
            <text x={0} y={y + 4} fontSize={10} fill="var(--theme-surface-500)">
              {Math.round(max * g)}
            </text>
          </g>
        );
      })}
      {curve.map((c, i) => {
        const h = (c.interactions / max) * innerH;
        const x = padLeft + i * slot + (slot - barW) / 2;
        const y = innerH - h;
        return (
          <g key={c.hour}>
            <rect x={x} y={y} width={barW} height={Math.max(0, h)} rx={2} fill="var(--accent-cyan)">
              <title>{`${String(c.hour).padStart(2, '0')}:00 — ${c.interactions} interactions, ${c.sessions} sessions`}</title>
            </rect>
            {c.hour % 3 === 0 ? (
              <text x={x + barW / 2} y={height - 6} fontSize={9} textAnchor="middle" fill="var(--theme-surface-500)">
                {c.hour}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
