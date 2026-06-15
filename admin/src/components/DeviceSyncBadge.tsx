import { AlertCircle, CheckCircle2, Clock3 } from 'lucide-react';
import { Spinner } from './ui/Spinner';
import type { DeviceSyncStatus } from '../stores/deviceSync';

function getBadgeClasses(phase: DeviceSyncStatus['phase']): string {
  switch (phase) {
    case 'failed':
      return 'border-red-200 bg-red-50 text-red-600';
    case 'live':
      return 'border-emerald-200 bg-emerald-50 text-emerald-600';
    case 'waiting':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'syncing':
    case 'rendering':
      return 'border-blue-200 bg-blue-50 text-blue-600';
    default:
      return 'border-surface-200 card-bg text-surface-600';
  }
}

function StatusIcon({ phase }: { phase: DeviceSyncStatus['phase'] }) {
  if (phase === 'failed') {
    return <AlertCircle className="h-3.5 w-3.5" />;
  }
  if (phase === 'live') {
    return <CheckCircle2 className="h-3.5 w-3.5" />;
  }
  if (phase === 'waiting') {
    return <Clock3 className="h-3.5 w-3.5" />;
  }
  return <Spinner size="sm" />;
}

export function DeviceSyncBadge({ status }: { status: DeviceSyncStatus | null | undefined }) {
  if (!status || status.phase === 'idle') {
    return null;
  }

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${getBadgeClasses(status.phase)}`}>
      <StatusIcon phase={status.phase} />
      {status.message}
    </span>
  );
}
