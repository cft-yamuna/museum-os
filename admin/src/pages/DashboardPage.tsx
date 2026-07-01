import { useEffect, useMemo } from 'react';
import type { ElementType, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  AppWindow,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FileImage,
  Link2,
  Link2Off,
  LogIn,
  Monitor,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react';
import clsx from 'clsx';
import { api } from '../lib/api';
import { adminWs } from '../lib/ws';
import { useSiteStore } from '../stores/site';
import { Spinner } from '../components/ui/Spinner';
import type { Alert, AuditLog, Device } from '../lib/types';

interface Schedule {
  id: string;
  is_enabled: boolean;
}

interface AlertSummary {
  high: number;
  medium: number;
  low: number;
  critical: number;
}

type ActionMeta = { icon: ElementType; bg: string; iconColor: string };

const staggerContainer = {
  initial: {},
  animate: { transition: { staggerChildren: 0.04 } },
};

const fadeInUp = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
  },
};

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  if (diffMs < 0) return 'just now';
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function getActionMeta(action: string): ActionMeta {
  const value = action.toLowerCase();
  if (value.includes('delet') || value.includes('remov')) {
    return { icon: Trash2, bg: 'bg-red-50 border-red-100 dark:bg-red-500/10 dark:border-red-500/20', iconColor: 'text-red-600 dark:text-red-300' };
  }
  if (value.includes('upload')) {
    return { icon: Upload, bg: 'bg-blue-50 border-blue-100 dark:bg-blue-500/10 dark:border-blue-500/20', iconColor: 'text-blue-700 dark:text-blue-300' };
  }
  if (value.includes('unassign')) {
    return { icon: Link2Off, bg: 'bg-amber-50 border-amber-100 dark:bg-amber-500/10 dark:border-amber-500/20', iconColor: 'text-amber-700 dark:text-amber-300' };
  }
  if (value.includes('assign')) {
    return { icon: Link2, bg: 'bg-emerald-50 border-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/20', iconColor: 'text-emerald-700 dark:text-emerald-300' };
  }
  if (value.includes('login') || value.includes('log in')) {
    return { icon: LogIn, bg: 'bg-surface-50 border-surface-200', iconColor: 'text-surface-600' };
  }
  if (value.includes('updat') || value.includes('edit') || value.includes('modif') || value.includes('sav') || value.includes('chang')) {
    return { icon: Pencil, bg: 'bg-blue-50 border-blue-100 dark:bg-blue-500/10 dark:border-blue-500/20', iconColor: 'text-blue-700 dark:text-blue-300' };
  }
  if (value.includes('creat') || value.includes('add')) {
    return { icon: Plus, bg: 'bg-emerald-50 border-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/20', iconColor: 'text-emerald-700 dark:text-emerald-300' };
  }
  return { icon: Activity, bg: 'bg-surface-50 border-surface-200', iconColor: 'text-surface-600' };
}

export function DashboardPage() {
  const activeSiteId = useSiteStore((s) => s.activeSiteId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const devicesQuery = useQuery({
    queryKey: ['devices', activeSiteId],
    queryFn: () => api.get<Device[]>(`/devices?site_id=${activeSiteId}`),
    enabled: !!activeSiteId,
  });

  const schedulesQuery = useQuery({
    queryKey: ['schedules', activeSiteId],
    queryFn: () => api.get<Schedule[]>(`/schedules?site_id=${activeSiteId}`),
    enabled: !!activeSiteId,
  });

  const alertsQuery = useQuery({
    queryKey: ['alerts', activeSiteId, 'unack'],
    queryFn: async () => {
      const res = await api.get<{ alerts: Alert[]; total: number }>(`/alerts?site_id=${activeSiteId}&acknowledged=false`);
      return res.alerts;
    },
    enabled: !!activeSiteId,
  });

  const alertSummaryQuery = useQuery({
    queryKey: ['alertSummary', activeSiteId],
    queryFn: () => api.get<AlertSummary>(`/alerts/summary?site_id=${activeSiteId}`),
    enabled: !!activeSiteId,
  });

  const appsQuery = useQuery({
    queryKey: ['apps', activeSiteId],
    queryFn: () => api.get<{ id: string; name: string }[]>(`/apps?site_id=${activeSiteId}`),
    enabled: !!activeSiteId,
  });

  const auditQuery = useQuery({
    queryKey: ['auditLogs', activeSiteId],
    queryFn: async () => {
      const res = await api.get<{ logs: AuditLog[]; total: number }>(`/audit-logs?site_id=${activeSiteId}&limit=8`);
      return res.logs;
    },
    enabled: !!activeSiteId,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const unsubStatus = adminWs.on('device:status', (_event, data) => {
      const payload = data as { device_id: string; status: Device['status'] };
      queryClient.setQueryData<Device[]>(['devices', activeSiteId], (prev) => {
        if (!prev) return prev;
        return prev.map((device) => (device.id === payload.device_id ? { ...device, status: payload.status } : device));
      });
    });

    const unsubAlert = adminWs.on('alert:created', () => {
      queryClient.invalidateQueries({ queryKey: ['alerts', activeSiteId] });
      queryClient.invalidateQueries({ queryKey: ['alertSummary', activeSiteId] });
    });

    return () => {
      unsubStatus();
      unsubAlert();
    };
  }, [activeSiteId, queryClient]);

  const devices = useMemo(() => devicesQuery.data ?? [], [devicesQuery.data]);
  const apps = useMemo(() => appsQuery.data ?? [], [appsQuery.data]);
  const schedules = useMemo(() => schedulesQuery.data ?? [], [schedulesQuery.data]);
  const alerts = useMemo(() => alertsQuery.data ?? [], [alertsQuery.data]);
  const alertSummary = alertSummaryQuery.data;
  const auditLogs = useMemo(() => auditQuery.data ?? [], [auditQuery.data]);

  const onlineCount = devices.filter((device) => device.status === 'online').length;
  const offlineCount = devices.filter((device) => device.status === 'offline').length;
  const errorCount = devices.filter((device) => device.status === 'error').length;
  const enabledSchedules = schedules.filter((schedule) => schedule.is_enabled).length;
  const unassignedDevices = devices.filter((device) => !device.app_id).length;
  const openAlertCount = alertSummary
    ? alertSummary.critical + alertSummary.high + alertSummary.medium + alertSummary.low
    : 0;
  const highSeverityCount = alertSummary ? alertSummary.critical + alertSummary.high : 0;
  const onlinePct = devices.length > 0 ? Math.round((onlineCount / devices.length) * 100) : 0;

  const attentionDevices = useMemo(() => {
    const errors = devices.filter((device) => device.status === 'error');
    const offline = devices.filter((device) => device.status === 'offline');
    return [...errors, ...offline].slice(0, 8);
  }, [devices]);

  const recentLogs = useMemo(() => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    return auditLogs.filter((log) => new Date(log.created_at) >= yesterday);
  }, [auditLogs]);

  const topAlert = useMemo(() => {
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return [...alerts].sort((a, b) => (order[a.severity] ?? 4) - (order[b.severity] ?? 4))[0] ?? null;
  }, [alerts]);

  if (!activeSiteId) {
    return (
      <div className="mx-auto max-w-[1400px]">
        <div className="admin-card p-8 text-sm text-surface-500">Select a site to view the dashboard.</div>
      </div>
    );
  }

  const isLoading = devicesQuery.isLoading || appsQuery.isLoading || schedulesQuery.isLoading || alertSummaryQuery.isLoading;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <motion.div className="mx-auto max-w-[1400px] space-y-5" initial="initial" animate="animate" variants={staggerContainer}>
      <motion.div variants={fadeInUp} className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-surface-500">Curato Admin</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-surface-950">Operations Overview</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-surface-500">
            Monitor kiosk health, active content systems, schedules, and alert volume from one operational view.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate('/devices')}
            className="admin-focus card-bg inline-flex h-9 items-center gap-2 rounded-md border border-surface-300 px-3 text-sm font-semibold text-surface-800 hover:bg-surface-50"
          >
            <Monitor className="h-4 w-4" />
            Devices
          </button>
          <button
            type="button"
            onClick={() => navigate('/content')}
            className="admin-focus inline-flex h-9 items-center gap-2 rounded-md bg-surface-950 px-3 text-sm font-semibold text-surface-50 hover:bg-surface-800"
          >
            <FileImage className="h-4 w-4" />
            Media Library
          </button>
        </div>
      </motion.div>

      {openAlertCount > 0 && topAlert && (
        <motion.div variants={fadeInUp}>
          <Link
            to="/alerts"
            className={clsx(
              'admin-card flex items-center gap-3 border-l-4 px-4 py-3 transition-colors hover:bg-surface-50',
              highSeverityCount > 0 ? 'border-l-red-600' : 'border-l-amber-500'
            )}
          >
            <AlertTriangle className={clsx('h-5 w-5 shrink-0', highSeverityCount > 0 ? 'text-red-600' : 'text-amber-600')} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-surface-900">
                {openAlertCount} active alert{openAlertCount > 1 ? 's' : ''}
              </div>
              <div className="truncate text-sm text-surface-500">{topAlert.message}</div>
            </div>
            <span className="hidden items-center gap-1 text-xs font-semibold uppercase text-surface-500 sm:flex">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        </motion.div>
      )}

      <motion.div variants={fadeInUp} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          icon={Monitor}
          label="Devices"
          value={devices.length}
          detail={`${onlineCount} online / ${offlineCount} offline${errorCount > 0 ? ` / ${errorCount} error` : ''}`}
          status={errorCount > 0 ? 'danger' : offlineCount > 0 ? 'warning' : 'success'}
          onClick={() => navigate('/devices')}
        />
        <MetricCard
          icon={AppWindow}
          label="Apps"
          value={apps.length}
          detail="Configured experiences"
          status="neutral"
          onClick={() => navigate('/apps')}
        />
        <MetricCard
          icon={CalendarClock}
          label="Schedules"
          value={enabledSchedules}
          detail={`${schedules.length} total schedules`}
          status="neutral"
          onClick={() => navigate('/schedules')}
        />
        <MetricCard
          icon={AlertTriangle}
          label="Open Alerts"
          value={openAlertCount}
          detail={`${highSeverityCount} high priority`}
          status={highSeverityCount > 0 ? 'danger' : openAlertCount > 0 ? 'warning' : 'success'}
          onClick={() => navigate('/alerts')}
        />
        <HealthCard onlinePct={onlinePct} onlineCount={onlineCount} offlineCount={offlineCount} errorCount={errorCount} />
      </motion.div>

      <motion.div variants={fadeInUp} className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <section className="admin-card overflow-hidden">
          <PanelHeader
            title="Needs Attention"
            action={
              <Link to="/devices" className="text-xs font-semibold uppercase tracking-wide text-surface-500 hover:text-surface-900">
                View devices
              </Link>
            }
          />

          {attentionDevices.length === 0 && unassignedDevices === 0 ? (
            <div className="flex items-center gap-3 px-5 py-8">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                <CheckCircle2 className="h-5 w-5" />
              </span>
              <div>
                <div className="text-sm font-semibold text-surface-900">All devices are healthy</div>
                <div className="text-sm text-surface-500">No offline, error, or unassigned screens require action.</div>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-surface-200">
              {attentionDevices.map((device) => (
                <button
                  key={device.id}
                  type="button"
                  onClick={() => navigate(`/devices/${device.id}`)}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-50"
                >
                  <StatusMark status={device.status} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-surface-900">{device.display_name}</div>
                    <div className="text-xs text-surface-500">{device.status === 'error' ? 'Error state' : 'Offline'}</div>
                  </div>
                  <span
                    className={clsx(
                      'rounded px-2 py-0.5 text-xs font-semibold uppercase',
                      device.status === 'error' ? 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300' : 'bg-surface-100 text-surface-600'
                    )}
                  >
                    {device.status}
                  </span>
                  <ArrowRight className="h-4 w-4 text-surface-300" />
                </button>
              ))}

              {unassignedDevices > 0 && (
                <button
                  type="button"
                  onClick={() => navigate('/devices')}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-50"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                    <Monitor className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-surface-900">{unassignedDevices} unassigned device{unassignedDevices > 1 ? 's' : ''}</div>
                    <div className="text-xs text-surface-500">Assign an app to complete the display setup.</div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-surface-300" />
                </button>
              )}
            </div>
          )}
        </section>

        <section className="admin-card overflow-hidden">
          <PanelHeader
            title="Recent Activity"
            action={
              <Link to="/logs" className="text-xs font-semibold uppercase tracking-wide text-surface-500 hover:text-surface-900">
                See all
              </Link>
            }
          />

          {recentLogs.length === 0 ? (
            <div className="flex items-center gap-3 px-5 py-8">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-50 text-surface-400">
                <Zap className="h-5 w-5" />
              </span>
              <div>
                <div className="text-sm font-semibold text-surface-900">No recent activity</div>
                <div className="text-sm text-surface-500">New operator changes will appear here.</div>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-surface-200">
              {recentLogs.slice(0, 7).map((entry) => {
                const meta = getActionMeta(entry.action);
                const ActionIcon = meta.icon;
                return (
                  <div key={entry.id} className="flex items-center gap-3 px-5 py-3">
                    <span className={clsx('flex h-8 w-8 shrink-0 items-center justify-center rounded-md border', meta.bg)}>
                      <ActionIcon className={clsx('h-4 w-4', meta.iconColor)} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-surface-700">
                        <span className="font-semibold text-surface-900">{entry.user_name ?? 'System'}</span>{' '}
                        {entry.action}
                      </div>
                      {entry.entity_type && <div className="text-xs text-surface-500">{entry.entity_type}</div>}
                    </div>
                    <span className="font-data shrink-0 text-xs text-surface-400">{formatRelativeTime(entry.created_at)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </motion.div>
    </motion.div>
  );
}

function PanelHeader({ action, title }: { action?: ReactNode; title: string }) {
  return (
    <div className="flex items-center justify-between border-b border-surface-200 px-5 py-3.5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-surface-700">{title}</h2>
      {action}
    </div>
  );
}

function MetricCard({
  detail,
  icon: Icon,
  label,
  onClick,
  status,
  value,
}: {
  detail: string;
  icon: ElementType;
  label: string;
  onClick: () => void;
  status: 'success' | 'warning' | 'danger' | 'neutral';
  value: number;
}) {
  const statusClass = {
    success: 'border-l-emerald-600',
    warning: 'border-l-amber-500',
    danger: 'border-l-red-600',
    neutral: 'border-l-primary-700',
  }[status];

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx('admin-card border-l-4 p-4 text-left transition-colors hover:bg-surface-50', statusClass)}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-surface-500">{label}</div>
        <Icon className="h-4 w-4 text-surface-400" />
      </div>
      <div className="mt-3 font-data text-3xl font-semibold text-surface-950">{value}</div>
      <div className="mt-1 truncate text-sm text-surface-500">{detail}</div>
    </button>
  );
}

function HealthCard({
  errorCount,
  offlineCount,
  onlineCount,
  onlinePct,
}: {
  errorCount: number;
  offlineCount: number;
  onlineCount: number;
  onlinePct: number;
}) {
  return (
    <div className="admin-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-surface-500">Health</div>
        <Activity className="h-4 w-4 text-surface-400" />
      </div>
      <div className="mt-3 flex items-end gap-2">
        <span className="font-data text-3xl font-semibold text-surface-950">{onlinePct}%</span>
        <span className="pb-1 text-sm text-surface-500">online</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-100">
        <div className="h-full rounded-full bg-emerald-600" style={{ width: `${onlinePct}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <LegendDot color="bg-emerald-600" label="Online" value={onlineCount} />
        <LegendDot color="bg-surface-400" label="Offline" value={offlineCount} />
        <LegendDot color="bg-red-600" label="Error" value={errorCount} />
      </div>
    </div>
  );
}

function LegendDot({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-surface-500">
        <span className={clsx('h-1.5 w-1.5 rounded-full', color)} />
        {label}
      </div>
      <div className="mt-1 font-data font-semibold text-surface-900">{value}</div>
    </div>
  );
}

function StatusMark({ status }: { status: Device['status'] }) {
  const classes =
    status === 'error'
      ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300'
      : status === 'online'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
        : 'border-surface-200 bg-surface-50 text-surface-500';

  return (
    <span className={clsx('flex h-9 w-9 items-center justify-center rounded-md border', classes)}>
      <Monitor className="h-4 w-4" />
    </span>
  );
}
