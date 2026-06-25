import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SlidersHorizontal, ShieldCheck, Volume2, VolumeX, Sun } from 'lucide-react';
import { api } from '../lib/api';
import { useToastStore } from '../stores/toast';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';

interface Telemetry {
  power?: boolean;
  volume?: number;
  muted?: boolean;
  brightness?: number;
  tempC?: number;
  lampHours?: number;
  cpuPct?: number;
  uptimeS?: number;
  firmware?: string;
  errors?: string[];
}

interface CapabilitiesResponse {
  device_id: string;
  driver_family: string | null;
  capabilities: string[];
  telemetry: Telemetry | null;
}

/**
 * Capability-driven control surface: queries the device's driver for what it
 * supports and renders only those controls + a live telemetry strip. Power lives
 * in the page header; this covers input/volume/mute/brightness/attest.
 */
export function DeviceControlPanel({ deviceId }: { deviceId: string }) {
  const addToast = useToastStore((s) => s.addToast);
  const [busy, setBusy] = useState<string | null>(null);
  const [input, setInput] = useState('');

  const { data, isLoading, refetch } = useQuery<CapabilitiesResponse>({
    queryKey: ['device-capabilities', deviceId],
    queryFn: () => api.get<CapabilitiesResponse>(`/devices/${deviceId}/capabilities`),
    refetchInterval: 30_000,
  });

  if (isLoading || !data) return null;
  const caps = data.capabilities ?? [];
  if (caps.length === 0 && !data.driver_family) return null;

  const has = (c: string) => caps.includes(c);
  const t = data.telemetry ?? {};

  const cmd = async (action: string, value?: unknown) => {
    setBusy(action);
    try {
      await api.post(`/devices/${deviceId}/command`, { action, value });
      addToast('success', `${action} sent`);
      refetch();
    } catch (e) {
      addToast('error', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const telemetryTiles: Array<[string, string]> = [];
  if (t.tempC !== undefined) telemetryTiles.push(['Temp', `${t.tempC}°C`]);
  if (t.cpuPct !== undefined) telemetryTiles.push(['CPU', `${t.cpuPct}%`]);
  if (t.lampHours !== undefined) telemetryTiles.push(['Lamp', `${t.lampHours} h`]);
  if (t.uptimeS !== undefined) telemetryTiles.push(['Uptime', `${Math.floor(t.uptimeS / 3600)} h`]);
  if (t.firmware) telemetryTiles.push(['Firmware', t.firmware]);

  return (
    <div className="bryzos-card rounded-3xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-surface-900">
          <SlidersHorizontal className="h-5 w-5" /> Controls
        </div>
        <div className="flex items-center gap-1.5">
          {data.driver_family && <Badge variant="info">{data.driver_family}</Badge>}
          {caps.map((c) => (
            <span key={c} className="px-1.5 py-0.5 rounded bg-surface-100 text-surface-600 text-xs">{c}</span>
          ))}
        </div>
      </div>

      {telemetryTiles.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {telemetryTiles.map(([k, v]) => (
            <div key={k} className="rounded-xl bg-surface-100 px-3 py-2">
              <div className="text-xs text-surface-500">{k}</div>
              <div className="text-sm font-medium text-surface-900">{v}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {has('mute') && (
          <Button variant="secondary" size="sm" loading={busy === 'mute'} onClick={() => cmd('mute', !t.muted)}>
            {t.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            {t.muted ? 'Unmute' : 'Mute'}
          </Button>
        )}
        {has('volume') && (
          <label className="flex items-center gap-2 text-sm text-surface-600">
            <Volume2 className="h-4 w-4" />
            <input
              type="range"
              min={0}
              max={100}
              defaultValue={t.volume ?? 50}
              onMouseUp={(e) => cmd('volume', Number((e.target as HTMLInputElement).value))}
            />
          </label>
        )}
        {has('brightness') && (
          <label className="flex items-center gap-2 text-sm text-surface-600">
            <Sun className="h-4 w-4" />
            <input
              type="range"
              min={0}
              max={100}
              defaultValue={t.brightness ?? 50}
              onMouseUp={(e) => cmd('brightness', Number((e.target as HTMLInputElement).value))}
            />
          </label>
        )}
        {has('input') && (
          <div className="flex items-center gap-1.5">
            <input
              className="w-24 px-2 py-1 rounded-xl border border-[var(--glass-border)] bg-transparent text-sm"
              placeholder="Input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <Button variant="secondary" size="sm" loading={busy === 'input'} disabled={!input} onClick={() => cmd('input', input)}>
              Set input
            </Button>
          </div>
        )}
        {has('attest') && (
          <Button variant="secondary" size="sm" loading={busy === 'attest'} onClick={() => cmd('attest')}>
            <ShieldCheck className="h-4 w-4" /> Attest
          </Button>
        )}
      </div>
    </div>
  );
}
