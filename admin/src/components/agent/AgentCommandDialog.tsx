import { useState, useEffect } from 'react';
import { X, Terminal, Play } from 'lucide-react';
import { Button } from '../ui/Button';
import { sendAgentCommand } from '../../lib/agentApi';
import type { AgentCommandResult } from '../../lib/types';

interface AgentCommandDialogProps {
  open: boolean;
  deviceId: string;
  onClose: () => void;
}

interface CommandDef {
  value: string;
  label: string;
  hasArgs?: boolean;
  argField?: string;
  options?: string[];
}

interface CommandGroup {
  label: string;
  commands: CommandDef[];
}

const COMMAND_GROUPS: CommandGroup[] = [
  {
    label: 'System',
    commands: [
      { value: 'ping', label: 'Ping' },
      { value: 'status', label: 'Status' },
      { value: 'restart-agent', label: 'Restart Agent' },
      { value: 'system:reboot', label: 'Reboot' },
      { value: 'system:shutdown', label: 'Shutdown' },
    ],
  },
  {
    label: 'Display',
    commands: [
      { value: 'display:brightness', label: 'Brightness', hasArgs: true, argField: 'level' },
      { value: 'display:power', label: 'Power', hasArgs: true, argField: 'state', options: ['on', 'off', 'standby'] },
      { value: 'display:rotate', label: 'Rotate', hasArgs: true, argField: 'rotation', options: ['normal', 'left', 'right', 'inverted'] },
      { value: 'display:volume', label: 'Volume', hasArgs: true, argField: 'level' },
      { value: 'display:info', label: 'Display Info' },
    ],
  },
  {
    label: 'Kiosk',
    commands: [
      { value: 'kiosk:launch', label: 'Launch', hasArgs: true, argField: 'url' },
      { value: 'kiosk:kill', label: 'Kill' },
      { value: 'kiosk:navigate', label: 'Navigate', hasArgs: true, argField: 'url' },
      { value: 'kiosk:restart', label: 'Restart' },
      { value: 'kiosk:status', label: 'Status' },
      { value: 'kiosk:screenshot', label: 'Screenshot' },
    ],
  },
];

export function AgentCommandDialog({ open, deviceId, onClose }: AgentCommandDialogProps) {
  const [selectedCommand, setSelectedCommand] = useState('ping');
  const [argValue, setArgValue] = useState('');
  const [awaitResponse, setAwaitResponse] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AgentCommandResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Find the current command definition
  const cmdDef = COMMAND_GROUPS.flatMap((g) => g.commands).find(
    (c) => c.value === selectedCommand
  );
  const hasArgs = cmdDef?.hasArgs ?? false;
  const argField = cmdDef?.argField ?? '';

  const handleSend = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const args = hasArgs && argValue
        ? { [argField]: isNaN(Number(argValue)) ? argValue : Number(argValue) }
        : undefined;

      const res = await sendAgentCommand(
        deviceId,
        selectedCommand,
        args,
        awaitResponse,
        awaitResponse ? 30_000 : undefined
      );
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Command failed');
    } finally {
      setLoading(false);
    }
  };

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bryzos-card rounded-3xl shadow-xl w-full max-w-md outline-none">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--glass-border)] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-surface-900 flex items-center gap-2">
            <Terminal className="h-4 w-4 text-surface-400" />
            Send Agent Command
          </h3>
          <button
            onClick={onClose}
            aria-label="Close command dialog"
            className="h-8 w-8 flex items-center justify-center rounded-xl text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Command picker */}
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1.5">Command</label>
            <select
              value={selectedCommand}
              onChange={(e) => {
                setSelectedCommand(e.target.value);
                setArgValue('');
                setResult(null);
                setError(null);
              }}
              className="h-8 w-full px-2.5 rounded-xl border border-surface-300 bg-surface-100 text-[13px] text-surface-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              {COMMAND_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.commands.map((cmd) => (
                    <option key={cmd.value} value={cmd.value}>
                      {cmd.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Dynamic args field */}
          {hasArgs && argField && (
            <div>
              <label className="block text-xs font-medium text-surface-500 mb-1.5">
                {argField}
              </label>
              {cmdDef?.options ? (
                <select
                  value={argValue}
                  onChange={(e) => setArgValue(e.target.value)}
                  className="h-8 w-full px-2.5 rounded-xl border border-surface-300 bg-surface-100 text-[13px] text-surface-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="">Select {argField}...</option>
                  {cmdDef.options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={argValue}
                  onChange={(e) => setArgValue(e.target.value)}
                  placeholder={`Enter ${argField}...`}
                  className="h-8 w-full px-2.5 rounded-xl border border-surface-300 bg-surface-100 text-[13px] text-surface-700 placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              )}
            </div>
          )}

          {/* Await response toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={awaitResponse}
              onChange={(e) => setAwaitResponse(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-surface-300"
            />
            <span className="text-[13px] text-surface-600">
              Wait for response (up to 30s)
            </span>
          </label>

          {/* Result display */}
          {result && (
            <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-3">
              <div className="text-[11px] font-medium text-emerald-500 uppercase mb-1">Result</div>
              <pre className="text-[12px] text-emerald-500 font-mono whitespace-pre-wrap break-all max-h-40 overflow-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-3">
              <div className="text-[11px] font-medium text-red-500 uppercase mb-1">Error</div>
              <p className="text-[12px] text-red-500">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--glass-border)] flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button
            size="sm"
            onClick={handleSend}
            loading={loading}
          >
            <Play className="h-3.5 w-3.5" />
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
