import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useSiteStore } from '../stores/site';
import { useToastStore } from '../stores/toast';
import { api } from '../lib/api';
import { adminWs } from '../lib/ws';
import { cronToHuman } from './ScheduleListPage';
import { Spinner } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';
import { AgentTab } from '../components/agent/AgentTab';
import { AgentCommandDialog } from '../components/agent/AgentCommandDialog';
import { DeviceSyncBadge } from '../components/DeviceSyncBadge';
import { useDeviceSyncTracking } from '../hooks/useDeviceSyncTracking';
import type { Device, Alert, App } from '../lib/types';
import { useDeviceSyncStore } from '../stores/deviceSync';
import {
  AppWindow,
  Calendar,
  ChevronRight,
  Check,
  Copy,
  ExternalLink,
  Link2,
  Monitor,
  Power,
  PowerOff,
  Radio,
  RotateCcw,
  Save,
  Wifi,
  WifiOff,
  AlertTriangle,
  Clock,
  Cpu,
  Usb,
  ScreenShare,
} from 'lucide-react';

interface ScheduleBasic {
  id: string;
  name: string;
  schedule_type: string;
  is_enabled: boolean;
  cron_expression: string;
}

// Status configuration
const STATUS_CONFIG: Record<Device['status'], { dot: string; bg: string; text: string; label: string }> = {
  online: { dot: 'bg-emerald-400', bg: 'bg-emerald-500/5', text: 'text-emerald-500', label: 'Display Active' },
  error: { dot: 'bg-red-400', bg: 'bg-red-500/5', text: 'text-red-500', label: 'Error' },
  offline: { dot: 'bg-surface-300', bg: 'bg-surface-100', text: 'text-surface-500', label: 'Display Down' },
  unavailable: { dot: 'bg-surface-300', bg: 'bg-surface-100', text: 'text-surface-500', label: 'Unavailable (parent off)' },
  restarting: { dot: 'bg-blue-400', bg: 'bg-blue-500/5', text: 'text-blue-500', label: 'Restarting' },
};

function StatusBadge({ status }: { status: Device['status'] }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return 'Never';
  const d = new Date(ts);
  return d.toLocaleString();
}

function SeverityBadge({ severity }: { severity: Alert['severity'] }) {
  const styles: Record<Alert['severity'], string> = {
    critical: 'bg-red-500/5 text-red-500',
    high: 'bg-red-500/5 text-red-500',
    medium: 'bg-amber-500/5 text-amber-500',
    low: 'bg-sky-500/5 text-sky-500',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-sm font-medium ${styles[severity]}`}>
      {severity}
    </span>
  );
}

export function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const activeSiteId = useSiteStore((s) => s.activeSiteId);
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();

  // Tab + form state
  const [activeTab, setActiveTab] = useState<'overview' | 'agent'>('overview');
  const [editName, setEditName] = useState('');
  const [editIpAddress, setEditIpAddress] = useState('');
  const [editComPort, setEditComPort] = useState('');
  const [editOrientation, setEditOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [commandDialogOpen, setCommandDialogOpen] = useState(false);
  const [screenMap, setScreenMap] = useState<Array<{ hardwareId: string; url: string; label?: string }>>([]);
  const [editParentId, setEditParentId] = useState<string>('');
  const [editPowerOrder, setEditPowerOrder] = useState<string>('');
  const deviceSyncStatus = useDeviceSyncStore((state) => (id ? state.statuses[id] : undefined));

  // Fetch device from list query
  const { data: devices = [], isLoading: devicesLoading } = useQuery({
    queryKey: ['devices', activeSiteId],
    queryFn: () => api.get<Device[]>(`/devices?site_id=${activeSiteId}`),
    enabled: !!activeSiteId,
    // Poll every 5s while any device is waiting for pairing
    refetchInterval: (query) => {
      const list = query.state.data as Device[] | undefined;
      return list?.some((d) => d.id === id && d.pairing_code) ? 5000 : false;
    },
  });

  const device = devices.find((d) => d.id === id) || null;

  // Power topology (derived from the already-loaded device list)
  const parentDevice = device?.parent_id ? devices.find((d) => d.id === device.parent_id) || null : null;
  const childDevices = id ? devices.filter((d) => d.parent_id === id) : [];
  const parentCandidates = devices.filter((d) => d.id !== id);

  useDeviceSyncTracking(id ? [id] : []);

  // Fetch apps for the site (for the picker)
  const { data: apps = [] } = useQuery({
    queryKey: ['apps', activeSiteId],
    queryFn: () => api.get<App[]>(`/apps?site_id=${activeSiteId}`),
    enabled: !!activeSiteId,
  });

  const activeApps = apps.filter((a) => a.is_active);

  // Seed form state when device loads or updates
  useEffect(() => {
    if (device) {
      setEditName(device.display_name);
      setEditIpAddress(device.ip_address || '');
      setEditComPort((device.config as Record<string, unknown>)?.com_port as string || '');
      setEditOrientation(((device.config as Record<string, unknown>)?.orientation as string || 'landscape') as 'landscape' | 'portrait');
      setSelectedAppId(device.app_id);
      setEditParentId(device.parent_id || '');
      setEditPowerOrder(device.power_order != null ? String(device.power_order) : '');
      const cfg = device.config as Record<string, unknown> || {};
      const existingMap = (cfg.screenMap as Array<{ hardwareId: string; url: string; label?: string }>) || [];

      // If no screenMap saved yet but device has a multi-screen app, pre-fill empty rows
      if (existingMap.length === 0 && device.app_id) {
        const assignedApp = apps.find(a => a.id === device.app_id);
        const appCfg = assignedApp?.config || {};
        const appScreens = (appCfg.screens as Array<{ screenIndex: number; screenLabel?: string }>) || [];
        const total = appScreens.length > 0 ? appScreens.length : ((appCfg.totalScreens as number) || 0);
        if (total > 0) {
          const prefilled: Array<{ hardwareId: string; url: string; label?: string }> = [];
          for (let i = 0; i < total; i++) {
            const label = appScreens.find(s => s.screenIndex === i)?.screenLabel || `Screen ${i + 1}`;
            prefilled.push({ hardwareId: '', url: '', label });
          }
          setScreenMap(prefilled);
        } else {
          setScreenMap([]);
        }
      } else {
        setScreenMap(existingMap);
      }
    }
  }, [device?.id, device?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time status updates
  useEffect(() => {
    const unsub = adminWs.on('device:status', (_event, data) => {
      const update = data as { device_id: string; status: Device['status']; last_seen?: string };
      queryClient.setQueryData<Device[]>(['devices', activeSiteId], (old) => {
        if (!old) return old;
        return old.map((d) =>
          d.id === update.device_id
            ? { ...d, status: update.status, last_seen: update.last_seen || d.last_seen }
            : d
        );
      });
    });
    return unsub;
  }, [activeSiteId, queryClient]);

  // Fetch device alerts
  const { data: alerts = [], isLoading: alertsLoading } = useQuery({
    queryKey: ['device-alerts', activeSiteId, id],
    queryFn: async () => {
      const res = await api.get<{ alerts: Alert[]; total: number }>(
        `/alerts?site_id=${activeSiteId}&device_id=${id}`
      );
      return res.alerts;
    },
    enabled: !!activeSiteId && !!id,
  });

  // Fetch schedules affecting this device
  const { data: deviceSchedules = [] } = useQuery({
    queryKey: ['device-schedules', activeSiteId, id],
    queryFn: async () => {
      const res = await api.get<ScheduleBasic[]>(
        `/schedules?site_id=${activeSiteId}&device_id=${id}`
      );
      return res;
    },
    enabled: !!activeSiteId && !!id,
    retry: false,
  });

  // Save device info mutation
  const saveMutation = useMutation({
    mutationFn: () =>
      api.put(`/devices/${id}`, {
        display_name: editName,
        ip_address: editIpAddress.trim() || null,
        config: {
          com_port: editComPort.trim() || null,
          orientation: editOrientation,
        },
      }),
    onSuccess: () => {
      const comPortChanged = editComPort.trim() !== ((device?.config as Record<string, unknown>)?.com_port as string || '');
      if (comPortChanged && editComPort.trim()) {
        const agentOnline = device?.agent_connected;
        addToast('success', agentOnline
          ? `Saved — COM port "${editComPort.trim()}" sent to agent. Serial bridge starting.`
          : `Saved — COM port "${editComPort.trim()}" stored. Agent is offline; bridge will start when agent connects.`
        );
      } else {
        addToast('success', 'Device saved');
      }
      queryClient.invalidateQueries({ queryKey: ['devices', activeSiteId] });
    },
    onError: (err) => {
      addToast('error', err instanceof Error ? err.message : 'Failed to save');
    },
  });

  // Power action mutation
  const powerMutation = useMutation({
    mutationFn: (action: 'power_on' | 'power_off' | 'restart') =>
      api.post(`/devices/${id}/power`, { action }),
    onSuccess: (_data, action) => {
      const label = action === 'power_on' ? 'Power On' : action === 'power_off' ? 'Power Off' : 'Restart';
      addToast('success', `${label} command sent`);
    },
    onError: (err) => {
      addToast('error', err instanceof Error ? err.message : 'Power action failed');
    },
  });

  // Assign/unassign app mutation
  const appAssignMutation = useMutation({
    mutationFn: (appId: string | null) =>
      api.put(`/devices/${id}`, { app_id: appId }),
    onSuccess: () => {
      addToast('success', selectedAppId ? 'App assigned to device' : 'App unassigned from device');
      queryClient.invalidateQueries({ queryKey: ['devices', activeSiteId] });
    },
    onError: (err) => {
      addToast('error', err instanceof Error ? err.message : 'Failed to update assignment');
    },
  });

  // Screen map save mutation
  const screenMapMutation = useMutation({
    mutationFn: () =>
      api.put(`/devices/${id}`, {
        config: { screenMap },
      }),
    onSuccess: () => {
      const agentOnline = device?.agent_connected;
      addToast('success', agentOnline
        ? `Screen mapping saved and pushed to agent`
        : `Screen mapping saved. Agent is offline — will apply when it connects.`
      );
      queryClient.invalidateQueries({ queryKey: ['devices', activeSiteId] });
    },
    onError: (err) => {
      addToast('error', err instanceof Error ? err.message : 'Failed to save screen mapping');
    },
  });

  // Power topology (parent / startup order) mutation
  const topologyMutation = useMutation({
    mutationFn: () =>
      api.put(`/devices/${id}`, {
        parent_id: editParentId || null,
        power_order: editPowerOrder.trim() === '' ? null : Number(editPowerOrder),
      }),
    onSuccess: () => {
      addToast('success', 'Power topology saved');
      queryClient.invalidateQueries({ queryKey: ['devices', activeSiteId] });
    },
    onError: (err) => addToast('error', err instanceof Error ? err.message : 'Failed to save topology'),
  });

  // Fault-injection (simulation) mutation
  const simulateMutation = useMutation({
    mutationFn: (fault: 'offline' | 'temp_high' | 'slow' | 'clear') =>
      api.post(`/devices/${id}/simulate`, { fault }),
    onSuccess: (_d, fault) => {
      addToast('success', fault === 'clear' ? 'Simulated fault cleared' : `Injected fault: ${fault}`);
      queryClient.invalidateQueries({ queryKey: ['devices', activeSiteId] });
      queryClient.invalidateQueries({ queryKey: ['device-alerts', activeSiteId, id] });
    },
    onError: (err) => addToast('error', err instanceof Error ? err.message : 'Simulation failed'),
  });

  // Copy feedback states
  const [urlCopied, setUrlCopied] = useState(false);
  const [slugCopied, setSlugCopied] = useState(false);

  const copySlug = () => {
    if (!device?.slug) return;
    navigator.clipboard.writeText(device.slug).then(() => {
      setSlugCopied(true);
      setTimeout(() => setSlugCopied(false), 2000);
    }).catch(() => {
      addToast('error', 'Failed to copy slug');
    });
  };

  const copyDisplayUrl = () => {
    if (!device || !device.slug) return;
    const url = `${window.location.protocol}//${window.location.hostname}:3401/display/${device.slug}`;
    navigator.clipboard.writeText(url).then(() => {
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    }).catch(() => {
      addToast('error', 'Failed to copy URL');
    });
  };

  const appChanged = device && selectedAppId !== device.app_id;

  // Loading state
  if (devicesLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="lg" className="text-surface-400" />
      </div>
    );
  }

  // Device not found
  if (!device) {
    return (
      <div className="space-y-6">
        <nav className="flex items-center gap-1.5 text-base">
          <button onClick={() => navigate('/devices')} className="text-surface-500 hover:text-surface-700">
            Devices
          </button>
          <ChevronRight className="h-5 w-5 text-surface-400" />
          <span className="text-surface-900">Not Found</span>
        </nav>
        <div className="bryzos-card rounded-3xl p-8 text-center">
          <Monitor className="h-12 w-12 text-surface-300 mx-auto mb-2" />
          <p className="text-base text-surface-500">Device not found or no longer available.</p>
          <button
            onClick={() => navigate('/devices')}
            className="mt-3 text-base text-primary-600 hover:text-primary-700"
          >
            Back to Devices
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header: breadcrumb + title + power actions */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <nav className="flex items-center gap-1.5 text-base">
            <button onClick={() => navigate('/devices')} className="text-surface-500 hover:text-surface-700">
              Devices
            </button>
            <ChevronRight className="h-5 w-5 text-surface-400" />
            <span className="text-surface-900">{device.display_name}</span>
          </nav>
          <div className="flex items-center gap-3 mt-1">
            <h1 className="text-3xl font-bold text-surface-900 tracking-tight">{device.display_name}</h1>
            <StatusBadge status={device.status} />
            {device.app_id && <DeviceSyncBadge status={deviceSyncStatus} />}
          </div>
        </div>
        {/* Power actions at top */}
        <div className="flex items-center gap-2 shrink-0 pt-1">
          <button
            onClick={() => powerMutation.mutate('power_on')}
            disabled={powerMutation.isPending}
            className="h-10 px-4 inline-flex items-center gap-2 rounded-xl border border-surface-200 bg-white text-sm font-medium text-surface-700 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 transition-all disabled:opacity-50"
          >
            <Power className="h-4 w-4 text-emerald-500" />
            Power On
          </button>
          <button
            onClick={() => powerMutation.mutate('restart')}
            disabled={powerMutation.isPending}
            className="h-10 px-4 inline-flex items-center gap-2 rounded-xl border border-surface-200 bg-white text-sm font-medium text-surface-700 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-700 transition-all disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4 text-amber-500" />
            Restart
          </button>
          <button
            onClick={() => powerMutation.mutate('power_off')}
            disabled={powerMutation.isPending}
            className="h-10 px-4 inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white text-sm font-medium text-red-500 hover:bg-red-50 hover:border-red-300 transition-all disabled:opacity-50"
          >
            <PowerOff className="h-4 w-4" />
            Power Off
          </button>
        </div>
      </div>

      {/* Display URL banner */}
      {device.slug && (
        <div className="border border-primary-500/20 rounded-3xl bg-primary-500/5 px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Link2 className="h-5 w-5 text-primary-500 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-primary-700 mb-0.5">Display URL</div>
              <div className="text-base text-primary-900 font-mono truncate">
                {window.location.protocol}//{window.location.hostname}:3401/display/{device.slug}
              </div>
            </div>
          </div>
          <button
            onClick={copyDisplayUrl}
            className="shrink-0 h-9 px-3.5 inline-flex items-center gap-1.5 rounded-xl border border-primary-300 card-bg text-sm font-medium text-primary-700 hover:bg-primary-500/10 transition-colors"
          >
            {urlCopied ? (
              <>
                <Check className="h-4.5 w-4.5" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4.5 w-4.5" />
                Copy URL
              </>
            )}
          </button>
        </div>
      )}

      {/* Pairing code banner */}
      {device.pairing_code && device.status !== 'online' && (
        <div className="border border-amber-500/20 rounded-3xl bg-amber-500/5 px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-amber-500 shrink-0" />
            <div>
              <div className="text-sm font-medium text-amber-500 mb-0.5">Pairing Code</div>
              <div className="text-xl font-bold text-amber-900 font-mono tracking-widest">
                {device.pairing_code}
              </div>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => {
              api.post(`/devices/provision/${device.slug}/pair`, {}).then(() => {
                addToast('success', 'Device paired successfully');
                queryClient.invalidateQueries({ queryKey: ['devices', activeSiteId] });
              }).catch(() => {
                addToast('error', 'Failed to pair device');
              });
            }}
          >
            <Check className="h-5 w-5" />
            Confirm Pairing
          </Button>
        </div>
      )}

      {/* Tab navigation */}
      <div className="flex gap-0 border-b border-[var(--glass-border)]">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-5 py-3 text-base font-medium border-b-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-primary-600 text-primary-700'
              : 'border-transparent text-surface-500 hover:text-surface-700'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('agent')}
          className={`px-5 py-3 text-base font-medium border-b-2 transition-colors inline-flex items-center gap-1.5 ${
            activeTab === 'agent'
              ? 'border-primary-600 text-primary-700'
              : 'border-transparent text-surface-500 hover:text-surface-700'
          }`}
        >
          <Cpu className="h-4.5 w-4.5" />
          Agent
          {device.agent_connected && (
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
          )}
        </button>
      </div>

      {/* Agent tab content */}
      {activeTab === 'agent' && (
        <AgentTab
          deviceId={device.id}
          onOpenCommandDialog={() => setCommandDialogOpen(true)}
        />
      )}

      {/* Agent command dialog */}
      <AgentCommandDialog
        open={commandDialogOpen}
        deviceId={device.id}
        onClose={() => setCommandDialogOpen(false)}
      />

      {/* Overview tab content */}
      {activeTab === 'overview' && (
      <div className="grid grid-cols-1 lg:grid-cols-[1fr,320px] gap-6">
        {/* Main content (left) */}
        <div className="space-y-6">
          {/* Power Topology */}
          <div className="bryzos-card rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--glass-border)] flex items-center justify-between">
              <h2 className="text-lg font-bold text-surface-900">Power Topology</h2>
              {(editParentId !== (device.parent_id || '') ||
                editPowerOrder !== (device.power_order != null ? String(device.power_order) : '')) && (
                <Button
                  size="sm"
                  onClick={() => topologyMutation.mutate()}
                  loading={topologyMutation.isPending}
                  className="h-9 px-3.5 text-sm"
                >
                  <Save className="h-4.5 w-4.5" />
                  Save
                </Button>
              )}
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-surface-600 mb-1.5">Power parent</label>
                  <select
                    value={editParentId}
                    onChange={(e) => setEditParentId(e.target.value)}
                    className="admin-control h-10 w-full px-3"
                  >
                    <option value="">None (independent)</option>
                    {parentCandidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.display_name || c.id}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-surface-500">
                    When the parent powers off, this device shows as “unavailable”.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-surface-600 mb-1.5">Startup order</label>
                  <input
                    type="number"
                    value={editPowerOrder}
                    onChange={(e) => setEditPowerOrder(e.target.value)}
                    placeholder="—"
                    className="admin-control h-10 w-full px-3"
                  />
                  <p className="mt-1 text-xs text-surface-500">
                    Lower numbers power on first in staggered startup.
                  </p>
                </div>
              </div>

              {parentDevice && (
                <div className="text-sm text-surface-600">
                  Parent:{' '}
                  <button
                    onClick={() => navigate(`/devices/${parentDevice.id}`)}
                    className="font-medium text-primary-600 hover:underline"
                  >
                    {parentDevice.display_name || parentDevice.id}
                  </button>
                </div>
              )}

              <div>
                <div className="text-sm font-semibold text-surface-600 mb-2">
                  Dependent devices ({childDevices.length})
                </div>
                {childDevices.length === 0 ? (
                  <p className="text-sm text-surface-500">No child devices depend on this one.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {childDevices.map((c) => (
                      <li key={c.id} className="flex items-center gap-2">
                        <span className={`status-dot status-dot--${c.status}`} />
                        <button
                          onClick={() => navigate(`/devices/${c.id}`)}
                          className="flex-1 truncate text-left text-sm text-surface-900 hover:underline"
                        >
                          {c.display_name || c.id}
                        </button>
                        <span className="text-xs capitalize text-surface-500">{c.status}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* Simulate (testing) */}
          <div className="bryzos-card rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--glass-border)]">
              <h2 className="text-lg font-bold text-surface-900">Simulate (testing)</h2>
              <p className="text-xs text-surface-500 mt-0.5">
                Inject a fault to demo cascade, alerts and analytics without hardware.
              </p>
            </div>
            <div className="p-5 flex flex-wrap gap-2">
              <button
                onClick={() => simulateMutation.mutate('offline')}
                disabled={simulateMutation.isPending}
                className="rounded-lg border border-surface-200 px-3 py-2 text-sm font-medium text-surface-700 hover:bg-[var(--glass-bg-hover)] disabled:opacity-50"
              >
                Mark offline
              </button>
              <button
                onClick={() => simulateMutation.mutate('temp_high')}
                disabled={simulateMutation.isPending}
                className="rounded-lg border border-surface-200 px-3 py-2 text-sm font-medium text-surface-700 hover:bg-[var(--glass-bg-hover)] disabled:opacity-50"
              >
                High temp
              </button>
              <button
                onClick={() => simulateMutation.mutate('slow')}
                disabled={simulateMutation.isPending}
                className="rounded-lg border border-surface-200 px-3 py-2 text-sm font-medium text-surface-700 hover:bg-[var(--glass-bg-hover)] disabled:opacity-50"
              >
                High load
              </button>
              <button
                onClick={() => simulateMutation.mutate('clear')}
                disabled={simulateMutation.isPending}
                className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
              >
                Clear
              </button>
            </div>
            {(device.config as Record<string, unknown>)?.sim_fault ? (
              <div className="px-5 pb-4 -mt-2 text-xs text-amber-600">
                Active simulated fault: {String((device.config as Record<string, unknown>).sim_fault)}
              </div>
            ) : null}
          </div>

          {/* Device Info + App Assignment — 2-column */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Device Info */}
            <div className="bryzos-card rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--glass-border)] flex items-center justify-between">
                <h2 className="text-lg font-bold text-surface-900">Device Info</h2>
                <div className="flex items-center gap-2">
                  {(editName !== device.display_name || editIpAddress !== (device.ip_address || '') || editComPort !== ((device.config as Record<string, unknown>)?.com_port as string || '') || editOrientation !== ((device.config as Record<string, unknown>)?.orientation as string || 'landscape')) && (
                    <Button
                      size="sm"
                      onClick={() => saveMutation.mutate()}
                      loading={saveMutation.isPending}
                      className="h-9 px-3.5 text-sm"
                    >
                      <Save className="h-4.5 w-4.5" />
                      Save
                    </Button>
                  )}
                </div>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-surface-600 mb-1.5">Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-10 w-full px-3.5 rounded-xl border border-surface-300 card-bg text-base text-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 transition-all"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-surface-500 mb-0.5">Type</div>
                    <div className="text-base font-medium text-surface-700 capitalize">{device.type}</div>
                  </div>
                  <div>
                    <div className="text-sm text-surface-500 mb-0.5">Slug</div>
                    <div className="text-base text-surface-700 font-mono flex items-center gap-1">
                      {device.slug || '--'}
                      {device.slug && (
                        <button onClick={copySlug} className="h-6 w-6 inline-flex items-center justify-center rounded-md text-surface-400 hover:text-surface-600 hover:bg-surface-100" title="Copy slug">
                          {slugCopied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-surface-500 mb-0.5">MAC Address</div>
                    <div className="text-base text-surface-700 font-mono">{device.mac_address || '--'}</div>
                  </div>
                </div>
                {device.hostname && (
                  <div>
                    <div className="text-sm text-surface-500 mb-0.5">Hostname</div>
                    <div className="text-base text-surface-700">{device.hostname}</div>
                  </div>
                )}
                <div className="pt-3 border-t border-surface-100">
                  <label className="block text-sm font-semibold text-surface-600 mb-1.5 flex items-center gap-1.5">
                    <Wifi className="h-4 w-4 text-surface-400" />
                    IP Address
                  </label>
                  <input
                    type="text"
                    value={editIpAddress}
                    onChange={(e) => setEditIpAddress(e.target.value)}
                    placeholder="e.g. 192.168.0.137"
                    className="h-10 w-full px-3.5 rounded-xl border border-surface-300 card-bg text-base text-surface-700 placeholder:text-surface-400 font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 transition-all"
                  />
                  <p className="text-xs text-surface-400 mt-1">Used for pairing, provisioning, and network commands. Leave blank if unknown.</p>
                </div>
                <div className="pt-3 border-t border-surface-100">
                  <label className="block text-sm font-semibold text-surface-600 mb-1.5 flex items-center gap-1.5">
                    <Usb className="h-4 w-4 text-surface-400" />
                    COM Port
                  </label>
                  <input
                    type="text"
                    value={editComPort}
                    onChange={(e) => setEditComPort(e.target.value)}
                    placeholder="e.g. COM3 or /dev/ttyUSB0"
                    className="h-10 w-full px-3.5 rounded-xl border border-surface-300 card-bg text-base text-surface-700 placeholder:text-surface-400 font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 transition-all"
                  />
                  <p className="text-xs text-surface-400 mt-1">Hardware port for monophone / ESP32. Leave blank if none.</p>
                </div>
                <div className="pt-3 border-t border-surface-100">
                  <label className="block text-sm font-semibold text-surface-600 mb-1.5 flex items-center gap-1.5">
                    <Monitor className="h-4 w-4 text-surface-400" />
                    Display Orientation
                  </label>
                  <select
                    value={editOrientation}
                    onChange={(e) => setEditOrientation(e.target.value as 'landscape' | 'portrait')}
                    className="h-10 w-full px-3.5 rounded-xl border border-surface-300 card-bg text-base text-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 transition-all"
                  >
                    <option value="landscape">Landscape</option>
                    <option value="portrait">Portrait</option>
                  </select>
                  <p className="text-xs text-surface-400 mt-1">Set to Portrait if the monitor is physically rotated. Agent will rotate Windows display automatically.</p>
                </div>
              </div>
            </div>

            {/* App Assignment */}
            <div className="bryzos-card rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--glass-border)] flex items-center justify-between">
                <h2 className="text-lg font-bold text-surface-900 flex items-center gap-1.5">
                  <AppWindow className="h-5 w-5 text-surface-400" />
                  App Assignment
                </h2>
                {appChanged && (
                  <Button
                    size="sm"
                    onClick={() => appAssignMutation.mutate(selectedAppId)}
                    loading={appAssignMutation.isPending}
                    className="h-9 px-3.5 text-sm"
                  >
                    <Save className="h-4.5 w-4.5" />
                    Save
                  </Button>
                )}
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-surface-600 mb-1.5">Assigned App</label>
                  <select
                    value={selectedAppId || ''}
                    onChange={(e) => setSelectedAppId(e.target.value || null)}
                    className="h-10 w-full px-3.5 rounded-xl border border-surface-300 card-bg text-base text-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 transition-all"
                  >
                    <option value="">No app assigned</option>
                    {activeApps.map((app) => (
                      <option key={app.id} value={app.id}>
                        {app.name} ({app.template_type})
                      </option>
                    ))}
                  </select>
                </div>
                {selectedAppId && (
                  <button
                    onClick={() => navigate(`/apps/${selectedAppId}`)}
                    className="inline-flex items-center gap-1.5 text-base text-primary-600 hover:text-primary-700"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Edit app configuration
                  </button>
                )}
                {activeApps.length === 0 && (
                  <p className="text-sm text-surface-400">
                    No apps created yet.{' '}
                    <button onClick={() => navigate('/apps/new')} className="text-primary-600 hover:text-primary-700">
                      Create one
                    </button>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Screen Mapping — assign display identity numbers to app content screens */}
          {(() => {
            // Get the assigned app's screen content (e.g. custom06 has screens[])
            const assignedApp = device.app_id ? activeApps.find(a => a.id === device.app_id) : null;
            const appConfig = assignedApp?.config || {};
            const appScreens = (appConfig.screens as Array<{ screenIndex: number; screenLabel?: string }>) || [];

            // Also check multi-screen template
            const totalScreens = appScreens.length > 0
              ? appScreens.length
              : (appConfig.totalScreens as number) || 0;

            if (totalScreens === 0) return null;

            const deviceCfg = (device.config as Record<string, unknown>) || {};
            const savedScreenMap = (deviceCfg.screenMap as Array<{ hardwareId: string; url: string; label?: string }>) || [];
            const screenMapChanged = JSON.stringify(screenMap) !== JSON.stringify(savedScreenMap);
            const detectedScreens = (deviceCfg.detectedScreens as Array<{
              hardwareId?: string;
              name?: string;
              index?: number;
              primary?: boolean;
            }>) || [];
            const displayOptions = detectedScreens.length > 0
              ? detectedScreens.map((screen, i) => {
                  const hardwareId = String(screen.hardwareId || screen.name || i + 1);
                  const match = hardwareId.match(/DISPLAY(\d+)$/i);
                  const displayNo = match?.[1] || String((screen.index ?? i) + 1);
                  return {
                    hardwareId,
                    label: `Display ${displayNo}${screen.primary ? ' (primary)' : ''}`,
                  };
                })
              : Array.from({ length: totalScreens }, (_, i) => ({
                  hardwareId: String(i + 1),
                  label: `Display ${i + 1}`,
                }));

            // Build screen labels from app config
            const screenLabels: string[] = [];
            for (let i = 0; i < totalScreens; i++) {
              const appScreen = appScreens.find(s => s.screenIndex === i);
              screenLabels.push(appScreen?.screenLabel || `Screen ${i + 1}`);
            }

            // Ensure screenMap has exactly totalScreens entries (fill missing ones)
            // Get display numbers already used in other rows
            const usedDisplayIds = (excludeIndex: number) =>
              screenMap.filter((_, i) => i !== excludeIndex).map(m => m.hardwareId).filter(Boolean);

            return (
              <div className="bryzos-card rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--glass-border)] flex items-center justify-between">
                  <h2 className="text-lg font-bold text-surface-900 flex items-center gap-1.5">
                    <ScreenShare className="h-5 w-5 text-surface-400" />
                    Display Assignment
                    <span className="text-sm text-surface-400 font-normal ml-1">({totalScreens} screens)</span>
                  </h2>
                  {screenMapChanged && (
                    <Button
                      size="sm"
                      onClick={() => screenMapMutation.mutate()}
                      loading={screenMapMutation.isPending}
                      className="h-9 px-3.5 text-sm"
                    >
                      <Save className="h-4.5 w-4.5" />
                      Save
                    </Button>
                  )}
                </div>
                <div className="p-5">
                  <p className="text-sm text-surface-400 mb-4">
                    Assign which physical display (identity number from Windows Display Settings) shows each screen's content.
                  </p>
                  <div className="space-y-3">
                    {screenLabels.map((label, idx) => {
                      const mapping = screenMap[idx];
                      const currentDisplayNo = mapping?.hardwareId || '';
                      const used = usedDisplayIds(idx);

                      return (
                        <div key={idx} className="flex items-center gap-4 p-3 rounded-xl border border-surface-200 bg-surface-50/50">
                          {/* Screen label from app config */}
                          <div className="shrink-0 w-36">
                            <div className="flex items-center gap-2">
                              <Monitor className="h-5 w-5 text-surface-400" />
                              <span className="text-sm font-medium text-surface-700">{label}</span>
                            </div>
                            <div className="text-xs text-surface-400 ml-7">Screen {idx + 1}</div>
                          </div>

                          {/* Display number dropdown */}
                          <div className="flex-1">
                            <select
                              value={currentDisplayNo}
                              onChange={(e) => {
                                const newDisplayId = e.target.value;
                                setScreenMap(prev => {
                                  const updated = [...prev];
                                  while (updated.length <= idx) {
                                    updated.push({ hardwareId: '', url: '', label: '' });
                                  }
                                  // If another row already has this display, swap them
                                  if (newDisplayId) {
                                    const conflictIdx = updated.findIndex((m, i) => i !== idx && m.hardwareId === newDisplayId);
                                    if (conflictIdx !== -1) {
                                      // Swap: give the conflicting row our current display
                                      updated[conflictIdx] = { ...updated[conflictIdx], hardwareId: updated[idx]?.hardwareId || '' };
                                    }
                                  }
                                  updated[idx] = { ...updated[idx], hardwareId: newDisplayId, label };
                                  return updated;
                                });
                              }}
                              className="h-10 w-full px-3.5 rounded-xl border border-surface-300 card-bg text-sm text-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 transition-all"
                            >
                              <option value="">Not assigned</option>
                              {displayOptions.map((display) => {
                                const displayId = display.hardwareId;
                                const assignedTo = screenLabels[screenMap.findIndex(m => m.hardwareId === displayId)];
                                const isOther = used.includes(displayId);
                                return (
                                  <option key={displayId} value={displayId}>
                                    {display.label}{isOther ? ` (${assignedTo})` : ''}
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Schedules + Alerts — 2-column */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Schedules */}
            <div className="bryzos-card rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--glass-border)] flex items-center justify-between">
                <h2 className="text-lg font-bold text-surface-900 flex items-center gap-1.5">
                  <Calendar className="h-5 w-5 text-surface-400" />
                  Schedules
                  {deviceSchedules.length > 0 && (
                    <span className="text-sm text-surface-400 font-normal ml-1">({deviceSchedules.length})</span>
                  )}
                </h2>
                {deviceSchedules.length > 0 && (
                  <button onClick={() => navigate('/schedules')} className="text-sm text-primary-600 hover:text-primary-700">
                    View all
                  </button>
                )}
              </div>
              {deviceSchedules.length === 0 ? (
                <div className="py-10 text-center text-base text-surface-400">
                  No schedules assigned
                </div>
              ) : (
                <div className="divide-y divide-surface-100">
                  {deviceSchedules.map((sched) => (
                    <button
                      key={sched.id}
                      onClick={() => navigate(`/schedules/${sched.id}/edit`)}
                      className="w-full px-5 py-3 flex items-center gap-3 hover:bg-surface-50 transition-colors text-left"
                    >
                      <span className={`h-2 w-2 rounded-full shrink-0 ${sched.is_enabled ? 'bg-emerald-400' : 'bg-surface-300'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-base font-medium text-surface-800 truncate">{sched.name}</div>
                        <div className="text-sm text-surface-400">{sched.schedule_type} &middot; {cronToHuman(sched.cron_expression)}</div>
                      </div>
                      <span className={`text-sm font-medium px-2 py-0.5 rounded ${sched.is_enabled ? 'bg-emerald-500/5 text-emerald-500' : 'bg-surface-100 text-surface-500'}`}>
                        {sched.is_enabled ? 'Active' : 'Disabled'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Alerts */}
            <div className="bryzos-card rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--glass-border)]">
                <h2 className="text-lg font-bold text-surface-900 flex items-center gap-1.5">
                  <AlertTriangle className="h-5 w-5 text-surface-400" />
                  Alerts
                  {alerts.length > 0 && (
                    <span className="ml-1.5 bg-red-500/5 text-red-500 text-sm font-medium px-2 py-0.5 rounded-full">
                      {alerts.length}
                    </span>
                  )}
                </h2>
              </div>
              <div>
                {alertsLoading && (
                  <div className="flex items-center justify-center py-10">
                    <Spinner size="sm" className="text-surface-400" />
                  </div>
                )}
                {!alertsLoading && alerts.length === 0 && (
                  <div className="py-10 text-center text-base text-surface-400">
                    No alerts for this device
                  </div>
                )}
                {!alertsLoading && alerts.length > 0 && (
                  <div className="divide-y divide-surface-100">
                    {alerts.map((alert) => (
                      <div key={alert.id} className="px-5 py-3 flex items-start gap-3 hover:bg-surface-50 transition-colors">
                        <SeverityBadge severity={alert.severity} />
                        <div className="flex-1 min-w-0">
                          <p className="text-base text-surface-700">{alert.message}</p>
                          <p className="text-sm text-surface-400 mt-0.5">{formatTimestamp(alert.created_at)}</p>
                        </div>
                        {alert.is_acknowledged && (
                          <span className="text-sm text-emerald-600 font-medium">ACK</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar (right) */}
        <div className="space-y-6">
          {/* Connection & Timing card */}
          <div className="bryzos-card rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-surface-500 uppercase">Display</span>
              <span className="text-base text-surface-600 flex items-center gap-1.5">
                {device.status === 'online' ? (
                  <Wifi className="h-4 w-4 text-emerald-500" />
                ) : (
                  <WifiOff className="h-4 w-4 text-surface-400" />
                )}
                {device.status === 'online' ? 'Active' : 'Down'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-surface-500 uppercase">Last Seen</span>
              <span className="text-base text-surface-600 flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-surface-400" />
                {formatTimestamp(device.last_seen)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-surface-500 uppercase">Created</span>
              <span className="text-base text-surface-600">{new Date(device.created_at).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Agent status card */}
          <div className="bryzos-card rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-surface-500 uppercase">Agent</span>
              {device.agent_connected ? (
                <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full font-medium">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm text-surface-500 bg-surface-100 px-2.5 py-1 rounded-full font-medium">
                  <span className="h-2 w-2 rounded-full bg-surface-300" />
                  Offline
                </span>
              )}
            </div>
            {device.agent_version && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-surface-500 uppercase">Version</span>
                <span className="text-base text-surface-600">v{device.agent_version}</span>
              </div>
            )}
            <button
              onClick={() => setActiveTab('agent')}
              className="w-full text-center text-sm text-primary-600 hover:text-primary-700 font-medium py-1"
            >
              View Agent Details
            </button>
          </div>

          {/* Metadata card */}
          <div className="bryzos-card rounded-2xl p-5">
            <h3 className="text-sm font-medium text-surface-500 uppercase mb-3">Metadata</h3>
            <div className="space-y-3">
              <div>
                <div className="text-sm text-surface-400">Device ID</div>
                <div className="text-base text-surface-600 font-mono break-all">{device.id}</div>
              </div>
              <div>
                <div className="text-sm text-surface-400">Site ID</div>
                <div className="text-base text-surface-600 font-mono break-all">{device.site_id}</div>
              </div>
              {device.floor_id && (
                <div>
                  <div className="text-sm text-surface-400">Floor / Zone</div>
                  <div className="text-base text-surface-600">{device.floor_id}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
