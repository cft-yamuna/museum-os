import type { HealthReport } from '../../lib/types';

interface GaugeProps {
  label: string;
  value: number | null;
  unit: string;
  max?: number;
  thresholds: { warn: number; critical: number };
}

function getGaugeColor(value: number, thresholds: { warn: number; critical: number }): string {
  if (value >= thresholds.critical) return '#ef4444'; // red-500
  if (value >= thresholds.warn) return '#f59e0b'; // amber-500
  return '#10b981'; // emerald-500
}

function Gauge({ label, value, unit, max = 100, thresholds }: GaugeProps) {
  const radius = 36;
  const stroke = 6;
  const circumference = 2 * Math.PI * radius;
  const percent = value !== null ? Math.min(value / max, 1) : 0;
  const dashOffset = circumference * (1 - percent);
  const color = value !== null ? getGaugeColor(value, thresholds) : '#d1d5db';

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width="88" height="88" viewBox="0 0 88 88" className="drop-shadow-sm">
        {/* Background track */}
        <circle
          cx="44"
          cy="44"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-surface-100"
          transform="rotate(-90 44 44)"
        />
        {/* Value arc */}
        <circle
          cx="44"
          cy="44"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 44 44)"
          style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.3s ease' }}
        />
        {/* Center text */}
        <text
          x="44"
          y="40"
          textAnchor="middle"
          className="text-surface-800 font-semibold"
          fontSize="16"
          fill="currentColor"
        >
          {value !== null ? Math.round(value) : '--'}
        </text>
        <text
          x="44"
          y="54"
          textAnchor="middle"
          className="text-surface-400"
          fontSize="10"
          fill="currentColor"
        >
          {unit}
        </text>
      </svg>
      <span className="text-[11px] font-medium text-surface-500 uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}

function formatUptime(seconds: number | null | undefined): string {
  if (seconds == null) return '--';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

interface HealthGaugesProps {
  health: HealthReport | null;
}

export function HealthGauges({ health }: HealthGaugesProps) {
  if (!health) {
    return (
      <div className="py-8 text-center text-[13px] text-surface-400">
        No health data available. Agent may not be reporting.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 justify-items-center">
        <Gauge
          label="CPU"
          value={health.cpuUsage}
          unit="%"
          thresholds={{ warn: 70, critical: 90 }}
        />
        <Gauge
          label="Memory"
          value={health.memPercent}
          unit="%"
          thresholds={{ warn: 75, critical: 90 }}
        />
        <Gauge
          label="Disk"
          value={health.diskPercent}
          unit="%"
          thresholds={{ warn: 80, critical: 95 }}
        />
        <Gauge
          label="Temp"
          value={health.cpuTemp}
          unit={'\u00B0C'}
          max={100}
          thresholds={{ warn: 65, critical: 80 }}
        />
      </div>

      {/* Supplemental info row */}
      <div className="flex items-center justify-center gap-6 text-[12px] text-surface-500">
        <span>
          Uptime: <strong className="text-surface-700">{formatUptime(health.uptime)}</strong>
        </span>
        {health.throttled === true && (
          <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Throttled
          </span>
        )}
        {health.gpuTemp != null && (
          <span>
            GPU: <strong className="text-surface-700">{Math.round(health.gpuTemp)}{'\u00B0'}C</strong>
          </span>
        )}
      </div>
    </div>
  );
}
