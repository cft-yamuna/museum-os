import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Power, PlayCircle, Clock, Layers, Monitor, CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';
import { api } from '../lib/api';
import { adminWs } from '../lib/ws';
import { useSiteStore } from '../stores/site';
import { useToastStore } from '../stores/toast';
import { Spinner } from '../components/ui/Spinner';
import type { Device, PowerPlan, PowerRunResult } from '../lib/types';

interface GroupRow {
  id: string;
  name: string;
  type: 'zone' | 'functional' | 'custom';
  member_count: number;
}

interface ProgressEntry {
  deviceId: string;
  deviceName: string | null;
  index: number;
  total: number;
}

type TargetType = 'group' | 'device';

export function PowerPage() {
  const activeSiteId = useSiteStore((s) => s.activeSiteId);
  const addToast = useToastStore((s) => s.addToast);

  const [targetType, setTargetType] = useState<TargetType>('group');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [staggerSec, setStaggerSec] = useState(10);
  const [openTime, setOpenTime] = useState('09:00');
  const [plan, setPlan] = useState<PowerPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const runTotalRef = useRef(0);

  const groupsQuery = useQuery({
    queryKey: ['groups', activeSiteId],
    queryFn: () => api.get<GroupRow[]>(`/groups?site_id=${activeSiteId}`),
    enabled: !!activeSiteId,
  });

  const devicesQuery = useQuery({
    queryKey: ['devices', activeSiteId],
    queryFn: () => api.get<Device[]>(`/devices?site_id=${activeSiteId}`),
    enabled: !!activeSiteId,
  });

  const options = useMemo(() => {
    if (targetType === 'group') {
      return (groupsQuery.data ?? []).map((g) => ({
        id: g.id,
        label: g.name,
        sub: `${g.type} · ${g.member_count} devices`,
      }));
    }
    return (devicesQuery.data ?? []).map((d) => ({
      id: d.id,
      label: d.display_name || d.id,
      sub: d.type,
    }));
  }, [targetType, groupsQuery.data, devicesQuery.data]);

  // Reset selection when switching target type.
  useEffect(() => {
    setSelected(new Set());
    setPlan(null);
  }, [targetType]);

  // Live progress over the admin WebSocket.
  useEffect(() => {
    const off = adminWs.on('scheduler:progress', (_event, data) => {
      const p = data as Partial<ProgressEntry> & { phase?: string };
      if (typeof p.index !== 'number' || typeof p.total !== 'number') return;
      setProgress((prev) => [
        ...prev,
        {
          deviceId: String(p.deviceId ?? ''),
          deviceName: (p.deviceName as string) ?? null,
          index: p.index!,
          total: p.total!,
        },
      ]);
      if (p.index === p.total) {
        setRunning(false);
      }
    });
    return off;
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPlan(null);
  }

  function selectAll() {
    setSelected(new Set(options.map((o) => o.id)));
    setPlan(null);
  }

  async function previewPlan() {
    if (!activeSiteId || selected.size === 0) return;
    setPlanning(true);
    try {
      const ids = [...selected].join(',');
      const result = await api.get<PowerPlan>(
        `/power/plan?site_id=${activeSiteId}&target_type=${targetType}&target_ids=${encodeURIComponent(ids)}&stagger_sec=${staggerSec}&open_time=${encodeURIComponent(openTime)}`
      );
      setPlan(result);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to compute plan');
    } finally {
      setPlanning(false);
    }
  }

  async function runNow() {
    if (!activeSiteId || selected.size === 0) return;
    setProgress([]);
    setRunning(true);
    try {
      const result = await api.post<PowerRunResult>('/power/run', {
        site_id: activeSiteId,
        target_type: targetType,
        target_ids: [...selected],
        stagger_sec: staggerSec,
      });
      runTotalRef.current = result.device_count;
      addToast(
        'success',
        `Staggered startup started for ${result.device_count} device(s) (~${result.estimated_seconds}s)`
      );
      if (result.device_count === 0) setRunning(false);
    } catch (err) {
      setRunning(false);
      addToast('error', err instanceof Error ? err.message : 'Failed to start sequence');
    }
  }

  if (!activeSiteId) {
    return <div className="p-6 text-surface-500">Select a site to manage power.</div>;
  }

  const isLoading = targetType === 'group' ? groupsQuery.isLoading : devicesQuery.isLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-surface-950">Power &amp; Startup</h1>
        <p className="text-sm text-surface-500">
          Stagger power-on across devices to avoid inrush, back-timed to opening.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* Left: configuration */}
        <div className="space-y-4">
          <div className="admin-card p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-surface-500">
              <Layers className="h-4 w-4" /> Targets
            </div>
            <div className="mb-3 flex overflow-hidden rounded-md border border-[var(--glass-border)]">
              {(['group', 'device'] as TargetType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTargetType(t)}
                  className={clsx(
                    'flex-1 px-3 py-1.5 text-xs font-semibold capitalize',
                    targetType === t
                      ? 'bg-primary-600 text-white'
                      : 'text-surface-600 hover:bg-[var(--glass-bg-hover)]'
                  )}
                >
                  {t === 'group' ? 'By group / zone' : 'By device'}
                </button>
              ))}
            </div>

            {isLoading ? (
              <div className="flex justify-center py-6"><Spinner /></div>
            ) : options.length === 0 ? (
              <p className="py-4 text-center text-sm text-surface-500">No {targetType}s found.</p>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-surface-500">{selected.size} selected</span>
                  <button onClick={selectAll} className="text-xs font-semibold text-primary-600 hover:underline">
                    Select all
                  </button>
                </div>
                <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
                  {options.map((o) => (
                    <label
                      key={o.id}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-[var(--glass-bg-hover)]"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(o.id)}
                        onChange={() => toggle(o.id)}
                        className="h-4 w-4 accent-[var(--accent-cyan)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-surface-900">{o.label}</span>
                        <span className="block truncate text-xs text-surface-500">{o.sub}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="admin-card space-y-4 p-4">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wide text-surface-500">
                  Stagger gap
                </label>
                <span className="font-data text-sm font-semibold text-surface-950">{staggerSec}s</span>
              </div>
              <input
                type="range"
                min={0}
                max={60}
                step={5}
                value={staggerSec}
                onChange={(e) => {
                  setStaggerSec(Number(e.target.value));
                  setPlan(null);
                }}
                className="w-full accent-[var(--accent-cyan)]"
              />
            </div>
            <div>
              <label className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-surface-500">
                <Clock className="h-4 w-4" /> Opening time
              </label>
              <input
                type="time"
                value={openTime}
                onChange={(e) => {
                  setOpenTime(e.target.value);
                  setPlan(null);
                }}
                className="admin-control w-full px-3"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={previewPlan}
                disabled={selected.size === 0 || planning}
                className="flex-1 rounded-md border border-[var(--glass-border)] px-3 py-2 text-sm font-semibold text-surface-800 hover:bg-[var(--glass-bg-hover)] disabled:opacity-50"
              >
                {planning ? 'Computing…' : 'Preview plan'}
              </button>
              <button
                onClick={runNow}
                disabled={selected.size === 0 || running}
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary-600 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
              >
                <PlayCircle className="h-4 w-4" />
                {running ? 'Running…' : 'Run now'}
              </button>
            </div>
          </div>
        </div>

        {/* Right: plan preview / progress */}
        <div className="space-y-4">
          {plan ? (
            <div className="admin-card p-4">
              <div className="mb-3 grid grid-cols-3 gap-3">
                <Summary label="First power-on" value={plan.first_on ?? '—'} />
                <Summary label="Last power-on" value={plan.last_on ?? '—'} />
                <Summary
                  label="Sequence length"
                  value={`${Math.floor(plan.total_seconds / 60)}m ${plan.total_seconds % 60}s`}
                />
              </div>
              <div className="overflow-hidden rounded-lg border border-[var(--glass-border)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-surface-500" style={{ background: 'var(--glass-bg-hover)' }}>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Device</th>
                      <th className="px-3 py-2">Power on</th>
                      <th className="px-3 py-2 text-right">Before open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.steps.map((s) => (
                      <tr key={s.device_id} className="border-t border-[var(--glass-border)]">
                        <td className="px-3 py-2 font-data text-surface-500">{s.index}</td>
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-2">
                            <Monitor className="h-3.5 w-3.5 text-surface-400" />
                            <span className="truncate text-surface-900">{s.display_name || s.device_id}</span>
                            {s.is_parent ? (
                              <span className="rounded bg-[var(--glass-bg-hover)] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-surface-500">
                                PC
                              </span>
                            ) : null}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-data text-surface-900">{s.power_on_at ?? '—'}</td>
                        <td className="px-3 py-2 text-right font-data text-surface-500">
                          −{s.seconds_before_open}s
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="admin-card flex flex-col items-center justify-center p-10 text-center text-sm text-surface-500">
              <Power className="mb-2 h-8 w-8 text-surface-400" />
              Select targets and preview a staggered startup plan.
            </div>
          )}

          {progress.length > 0 ? (
            <div className="admin-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-surface-500">
                  Live progress
                </span>
                {running ? <Spinner size="sm" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              </div>
              <ul className="space-y-1">
                {progress.map((p, i) => (
                  <li key={`${p.deviceId}-${i}`} className="flex items-center gap-2 text-sm">
                    <span className="status-dot status-dot--online" />
                    <span className="flex-1 truncate text-surface-900">
                      {p.deviceName || p.deviceId}
                    </span>
                    <span className="font-data text-xs text-surface-500">
                      {p.index}/{p.total}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--glass-border)] p-3" style={{ background: 'var(--glass-bg)' }}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-surface-500">{label}</div>
      <div className="mt-1 font-data text-lg font-semibold text-surface-950">{value}</div>
    </div>
  );
}
