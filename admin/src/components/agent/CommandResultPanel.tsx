import { useState, useEffect, useCallback } from 'react';
import { adminWs } from '../../lib/ws';
import { X, CheckCircle2, XCircle } from 'lucide-react';

interface CommandResult {
  id: string;
  deviceId: string;
  command: string;
  success: boolean;
  message?: string;
  timestamp: number;
}

const MAX_RESULTS = 5;
const AUTO_DISMISS_MS = 15_000;

export function CommandResultPanel() {
  const [results, setResults] = useState<CommandResult[]>([]);

  const addResult = useCallback((result: CommandResult) => {
    setResults((prev) => {
      const updated = [result, ...prev].slice(0, MAX_RESULTS);
      return updated;
    });
  }, []);

  const removeResult = useCallback((id: string) => {
    setResults((prev) => prev.filter((r) => r.id !== id));
  }, []);

  // Subscribe to command results via WebSocket
  useEffect(() => {
    const unsub = adminWs.on('agent:command_result', (_event, data) => {
      const payload = data as {
        payload?: {
          deviceId: string;
          id: string;
          command: string;
          success: boolean;
          output?: string;
          error?: string;
        };
        deviceId?: string;
        id?: string;
        command?: string;
        success?: boolean;
        output?: string;
        error?: string;
      };

      // Handle both wrapped {payload:...} and flat formats
      const r = payload.payload || payload;
      const result: CommandResult = {
        id: (r.id as string) || `${Date.now()}`,
        deviceId: (r.deviceId as string) || '',
        command: (r.command as string) || 'unknown',
        success: (r.success as boolean) ?? true,
        message: (r.output as string) || (r.error as string) || undefined,
        timestamp: Date.now(),
      };

      addResult(result);
    });

    return unsub;
  }, [addResult]);

  // Auto-dismiss old results
  useEffect(() => {
    if (results.length === 0) return;
    const timer = setInterval(() => {
      const cutoff = Date.now() - AUTO_DISMISS_MS;
      setResults((prev) => prev.filter((r) => r.timestamp > cutoff));
    }, 3000);
    return () => clearInterval(timer);
  }, [results.length]);

  if (results.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 space-y-2 max-w-xs w-full">
      {results.map((result) => (
        <div
          key={result.id}
          className={`rounded-xl border shadow-lg p-3 flex items-start gap-2.5 animate-in slide-in-from-right ${
            result.success
              ? 'bryzos-card border-emerald-500/20'
              : 'bryzos-card border-red-500/20'
          }`}
        >
          {result.success ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium text-surface-900">
              {result.command}
            </div>
            {result.message && (
              <div className="text-[11px] text-surface-500 mt-0.5 truncate">
                {result.message}
              </div>
            )}
          </div>
          <button
            onClick={() => removeResult(result.id)}
            className="h-5 w-5 flex items-center justify-center rounded text-surface-400 hover:text-surface-600 shrink-0"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
