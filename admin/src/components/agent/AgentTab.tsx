import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToastStore } from '../../stores/toast';
import { useSiteStore } from '../../stores/site';
import { useAgentHealth } from '../../hooks/useAgentHealth';
import { sendAgentCommand, fetchAgentStatus, pushAgentUpdate } from '../../lib/agentApi';
import { adminWs } from '../../lib/ws';
import { HealthGauges } from './HealthGauges';
import { ScreenshotViewer } from './ScreenshotViewer';
import { Spinner } from '../ui/Spinner';
import {
  RotateCcw,
  Power,
  PowerOff,
  RefreshCw,
  Terminal,
  Cpu,
  Download,
  Monitor,
  HardDrive,
} from 'lucide-react';

interface AgentTabProps {
  deviceId: string;
  onOpenCommandDialog?: () => void;
}

interface QuickAction {
  label: string;
  command: string;
  icon: React.ComponentType<{ className?: string }>;
  variant: 'default' | 'danger';
  confirm?: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Restart Browser', command: 'kiosk:restart', icon: RotateCcw, variant: 'default' },
  { label: 'Restart Agent', command: 'restart-agent', icon: RefreshCw, variant: 'default' },
  { label: 'Reboot', command: 'system:reboot', icon: Power, variant: 'danger', confirm: 'Reboot this device?' },
  { label: 'Shutdown', command: 'system:shutdown', icon: PowerOff, variant: 'danger', confirm: 'Shut down this device?' },
];

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function AgentTab({ deviceId, onOpenCommandDialog }: AgentTabProps) {
  const { agentInfo, isLoading } = useAgentHealth(deviceId);
  const activeSiteId = useSiteStore((s) => s.activeSiteId);
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const [runningCmd, setRunningCmd] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updatePushed, setUpdatePushed] = useState(false);
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen for agent reconnect after update push
  useEffect(() => {
    if (!updatePushed) return;

    const unsub = adminWs.on('agent:status', (_event, data: unknown) => {
      const d = data as { device_id?: string };
      if (d.device_id === deviceId) {
        // Agent reconnected with new version
        queryClient.invalidateQueries({ queryKey: ['agent-status'] });
        queryClient.invalidateQueries({ queryKey: ['agent-info'] });
        setUpdatePushed(false);
        if (updateTimeoutRef.current) {
          clearTimeout(updateTimeoutRef.current);
          updateTimeoutRef.current = null;
        }
        addToast('success', 'Agent updated successfully');
      }
    });

    return unsub;
  }, [updatePushed, deviceId, queryClient, addToast]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  // Fetch agent version status
  const { data: agentStatus } = useQuery({
    queryKey: ['agent-status', activeSiteId],
    queryFn: () => fetchAgentStatus(activeSiteId!),
    enabled: !!activeSiteId,
    refetchInterval: 60_000,
  });

  const deviceStatus = agentStatus?.devices.find((d) => d.id === deviceId);
  const latestVersion = deviceStatus?.latest_version || null;
  const updateAvailable = deviceStatus?.update_status === 'update_available';

  const handleQuickAction = async (action: QuickAction) => {
    if (action.confirm && !window.confirm(action.confirm)) return;

    setRunningCmd(action.command);
    try {
      await sendAgentCommand(deviceId, action.command);
      addToast('success', `${action.label} command sent`);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : `${action.label} failed`);
    } finally {
      setRunningCmd(null);
    }
  };

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      const result = await pushAgentUpdate(deviceId);
      const dev = result.devices[0];
      if (dev?.delivered) {
        addToast('info', `Update to ${latestVersion} pushed — waiting for agent to restart…`);
        setUpdatePushed(true);
        // 90s timeout fallback — if agent doesn't reconnect, reset state
        updateTimeoutRef.current = setTimeout(() => {
          updateTimeoutRef.current = null;
          setUpdatePushed(false);
          queryClient.invalidateQueries({ queryKey: ['agent-status'] });
          queryClient.invalidateQueries({ queryKey: ['agent-info'] });
          addToast('warning', 'Agent has not reconnected yet — check device');
        }, 90_000);
      } else {
        addToast('error', dev?.error || 'Update could not be delivered');
      }
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Update failed');
    } finally {
      setUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="lg" className="text-surface-400" />
      </div>
    );
  }

  const health = agentInfo?.last_health;

  return (
    <div className="space-y-4">
      {/* Agent status bar */}
      <div className="bryzos-card rounded-3xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Cpu className="h-4 w-4 text-surface-400" />
          <div>
            <div className="text-[13px] font-medium text-surface-900 flex items-center gap-2">
              Agent
              {agentInfo?.agent_connected ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-500 bg-emerald-500/5 px-1.5 py-0.5 rounded font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] text-surface-500 bg-surface-100 px-1.5 py-0.5 rounded font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-surface-300" />
                  Disconnected
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {agentInfo?.agent_version && (
                <span className="text-[11px] text-surface-400">
                  v{agentInfo.agent_version}
                </span>
              )}
              {updateAvailable && latestVersion && (
                <span className="text-[11px] text-amber-500 font-medium">
                  (v{latestVersion.split('+')[0]} available)
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(updateAvailable || updatePushed) && agentInfo?.agent_connected && (
            <button
              onClick={handleUpdate}
              disabled={updating || updatePushed}
              className="h-7 px-2.5 inline-flex items-center gap-1.5 rounded-xl bg-surface-950 text-surface-50 text-[12px] font-medium hover:bg-surface-800 transition-colors disabled:opacity-50"
              title={updateAvailable ? 'Install the latest uploaded agent package' : 'Reinstall the latest uploaded agent package'}
            >
              {(updating || updatePushed) ? <Spinner size="sm" /> : <Download className="h-3.5 w-3.5" />}
              {updatePushed ? 'Updating…' : 'Update'}
            </button>
          )}
          {latestVersion && !updateAvailable && !updatePushed && agentInfo?.agent_connected && (
            <button
              onClick={handleUpdate}
              disabled={updating}
              className="h-7 px-2.5 inline-flex items-center gap-1.5 rounded-xl bg-surface-950 text-surface-50 text-[12px] font-medium hover:bg-surface-800 transition-colors disabled:opacity-50"
              title="Reinstall the latest uploaded agent package"
            >
              {updating ? <Spinner size="sm" /> : <Download className="h-3.5 w-3.5" />}
              Rebuild
            </button>
          )}
          {onOpenCommandDialog && (
            <button
              onClick={onOpenCommandDialog}
              className="h-7 px-2.5 inline-flex items-center gap-1.5 rounded-xl border border-surface-300 card-bg text-[12px] font-medium text-surface-700 hover:bg-surface-50 transition-colors"
            >
              <Terminal className="h-3.5 w-3.5" />
              Send Command
            </button>
          )}
        </div>
      </div>

      {/* System info */}
      {health && (health.platform || health.osVersion || health.cpuModel) && (
        <div className="bryzos-card rounded-3xl p-4">
          <h3 className="text-xs font-medium text-surface-500 uppercase tracking-wider mb-3">
            System Info
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {health.platform && (
              <div>
                <div className="text-[11px] text-surface-400">Platform</div>
                <div className="text-[13px] font-medium text-surface-800 capitalize">{health.platform}</div>
              </div>
            )}
            {health.osVersion && (
              <div>
                <div className="text-[11px] text-surface-400">OS</div>
                <div className="text-[13px] font-medium text-surface-800">{health.osVersion}</div>
              </div>
            )}
            {health.hostname && (
              <div>
                <div className="text-[11px] text-surface-400">Hostname</div>
                <div className="text-[13px] font-medium text-surface-800">{health.hostname}</div>
              </div>
            )}
            {health.cpuModel && (
              <div>
                <div className="text-[11px] text-surface-400">CPU</div>
                <div className="text-[13px] font-medium text-surface-800">{health.cpuModel} ({health.cpuCores} cores)</div>
              </div>
            )}
            {health.nodeVersion && (
              <div>
                <div className="text-[11px] text-surface-400">Node.js</div>
                <div className="text-[13px] font-medium text-surface-800">{health.nodeVersion}</div>
              </div>
            )}
            {health.systemUptime != null && (
              <div>
                <div className="text-[11px] text-surface-400">System Uptime</div>
                <div className="text-[13px] font-medium text-surface-800">{formatUptime(health.systemUptime)}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Screens */}
      {health && health.screens && health.screens.length > 0 && (
        <div className="bryzos-card rounded-3xl p-4">
          <h3 className="text-xs font-medium text-surface-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Monitor className="h-3.5 w-3.5" />
            Displays ({health.screenCount || health.screens.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {health.screens.map((screen, i) => (
              <div
                key={screen.hardwareId || i}
                className="flex items-center gap-3 px-3 py-2 rounded-xl bg-surface-50 border border-surface-100"
              >
                <HardDrive className="h-3.5 w-3.5 text-surface-400 shrink-0" />
                <div>
                  <div className="text-[12px] font-medium text-surface-800">
                    {screen.width}x{screen.height}
                    {screen.primary && (
                      <span className="ml-1.5 text-[10px] text-blue-500 bg-blue-500/10 px-1 py-0.5 rounded">Primary</span>
                    )}
                  </div>
                  <div className="text-[11px] text-surface-400">
                    {screen.name} @ ({screen.x}, {screen.y})
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Health gauges */}
      <div className="bryzos-card rounded-3xl p-4">
        <h3 className="text-xs font-medium text-surface-500 uppercase tracking-wider mb-3">
          System Health
        </h3>
        <HealthGauges health={health || null} />
      </div>

      {/* Quick actions */}
      <div className="bryzos-card rounded-3xl p-4">
        <h3 className="text-xs font-medium text-surface-500 uppercase tracking-wider mb-3">
          Quick Actions
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            const isRunning = runningCmd === action.command;
            return (
              <button
                key={action.command}
                onClick={() => handleQuickAction(action)}
                disabled={isRunning || !agentInfo?.agent_connected}
                className={`h-9 px-3 inline-flex items-center justify-center gap-2 rounded-xl text-[12px] font-medium transition-colors disabled:opacity-50 ${
                  action.variant === 'danger'
                    ? 'border border-red-500/20 text-red-500 hover:bg-red-500/5'
                    : 'border border-surface-200 text-surface-700 hover:bg-surface-50'
                }`}
              >
                {isRunning ? (
                  <Spinner size="sm" />
                ) : (
                  <Icon className="h-3.5 w-3.5" />
                )}
                {action.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Screenshots */}
      <div className="bryzos-card rounded-3xl p-4">
        <ScreenshotViewer deviceId={deviceId} />
      </div>
    </div>
  );
}
