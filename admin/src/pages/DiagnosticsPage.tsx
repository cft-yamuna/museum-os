import { useState } from 'react';
import { Wrench, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useSiteStore } from '../stores/site';
import { useToastStore } from '../stores/toast';
import { Button } from '../components/ui/Button';

interface ActionResult {
  total?: number;
  delivered?: number;
  results?: Array<{ id: string; ok: boolean; error?: string }>;
  deviceIds?: string[];
}

type ActionKey = 'restart-all' | 'attest-all' | 'clear-caches';

const ACTIONS: Array<{
  key: ActionKey;
  label: string;
  desc: string;
  icon: typeof RotateCcw;
  confirm: string;
  variant: 'primary' | 'danger' | 'secondary';
}> = [
  { key: 'restart-all', label: 'Restart all', desc: 'Staggered restart of every device in the site through its driver.', icon: RotateCcw, confirm: 'Restart every device in this site?', variant: 'danger' },
  { key: 'attest-all', label: 'Attest fleet', desc: 'Request an attestation from every device whose driver supports it.', icon: ShieldCheck, confirm: 'Request attestation from all devices?', variant: 'primary' },
  { key: 'clear-caches', label: 'Clear caches', desc: 'Tell every agent to refresh its content cache.', icon: Trash2, confirm: 'Clear caches on all devices?', variant: 'secondary' },
];

export function DiagnosticsPage() {
  const activeSiteId = useSiteStore((s) => s.activeSiteId);
  const addToast = useToastStore((s) => s.addToast);
  const [running, setRunning] = useState<ActionKey | null>(null);
  const [result, setResult] = useState<{ key: ActionKey; data: ActionResult } | null>(null);

  const run = async (key: ActionKey, confirmMsg: string) => {
    if (!activeSiteId) {
      addToast('error', 'No active site selected');
      return;
    }
    if (!window.confirm(confirmMsg)) return;
    setRunning(key);
    setResult(null);
    try {
      const data = await api.post<ActionResult>(`/diagnostics/${key}`, { site_id: activeSiteId });
      setResult({ key, data });
      addToast('success', `${key} complete`);
    } catch (e) {
      addToast('error', (e as Error).message);
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-surface-900 flex items-center gap-2">
          <Wrench className="h-6 w-6" /> Diagnostics
        </h1>
        <p className="text-base text-surface-500">Fleet-wide maintenance actions through the unified driver layer.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {ACTIONS.map((a) => (
          <div key={a.key} className="bryzos-card rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-surface-900 font-semibold">
              <a.icon className="h-5 w-5" /> {a.label}
            </div>
            <p className="text-sm text-surface-500 min-h-[40px]">{a.desc}</p>
            <Button
              variant={a.variant}
              size="sm"
              loading={running === a.key}
              disabled={running !== null}
              onClick={() => run(a.key, a.confirm)}
            >
              Run
            </Button>
          </div>
        ))}
      </div>

      {result && (
        <div className="bryzos-card rounded-2xl p-4 space-y-2">
          <h2 className="font-semibold text-surface-900">Result — {result.key}</h2>
          {result.data.total !== undefined && (
            <p className="text-sm text-surface-600">
              {result.data.results?.filter((r) => r.ok).length ?? 0} / {result.data.total} succeeded
            </p>
          )}
          {result.data.delivered !== undefined && (
            <p className="text-sm text-surface-600">{result.data.delivered} device(s) acknowledged</p>
          )}
          {result.data.results && result.data.results.some((r) => !r.ok) && (
            <ul className="text-sm text-red-500 space-y-0.5">
              {result.data.results.filter((r) => !r.ok).map((r) => (
                <li key={r.id} className="font-mono">{r.id}: {r.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
