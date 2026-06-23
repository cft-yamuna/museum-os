import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Settings,
  Globe,
  Link2,
  Server,
  Shield,
  Upload,
  Download,
  Copy,
  Check,
  Building2,
  Clock,
  MapPin,
  Wifi,
  Key,
  Radio,
  Hash,
  Calendar,
  Activity,
  ChevronRight,
  Database,
  Film,
} from 'lucide-react';
import { api } from '../lib/api';
import { useSiteStore } from '../stores/site';
import { useToastStore } from '../stores/toast';
import { useAuthStore } from '../stores/auth';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { formatDateTime } from '../lib/utils';
import type { Site } from '../lib/types';

const TIMEZONES = [
  'UTC', 'Asia/Kolkata', 'America/New_York', 'America/Chicago',
  'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris',
  'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Dubai',
  'Australia/Sydney', 'Pacific/Auckland',
];

const INPUT_CLASS =
  'card-bg h-10 w-full rounded-md border border-surface-300 px-3 text-sm text-surface-800 placeholder:text-surface-400 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20';

// Animation
const fadeIn = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const },
};

// -- Section wrapper --------------------------------------------------------

interface SectionProps {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  danger?: boolean;
  children: React.ReactNode;
}

function Section({ icon: Icon, title, subtitle, action, danger, children }: SectionProps) {
  return (
    <motion.div
      {...fadeIn}
      className={
        danger
          ? 'rounded-md border border-red-200 bg-red-50/60 dark:border-red-500/30 dark:bg-red-500/10'
          : 'admin-card'
      }
    >
      <div className="flex items-center justify-between border-b border-[var(--glass-border)] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-md ${
            danger ? 'bg-red-100 dark:bg-red-500/15' : 'bg-primary-100'
          }`}>
            <Icon className={`h-4.5 w-4.5 ${danger ? 'text-red-600 dark:text-red-300' : 'text-primary-700'}`} />
          </div>
          <div>
            <h2 className="text-base font-semibold leading-tight text-surface-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-surface-500">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </motion.div>
  );
}

// -- Field wrapper ----------------------------------------------------------

function Field({ icon: Icon, label, children, hint }: {
  icon?: React.ElementType;
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </label>
      {children}
      {hint && <p className="text-sm text-surface-400 mt-1.5">{hint}</p>}
    </div>
  );
}

// -- Site Info Form ---------------------------------------------------------

function SiteInfoForm({ site }: { site: Site }) {
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();

  const [name, setName] = useState(site.name);
  const [timezone, setTimezone] = useState(site.timezone);
  const [address, setAddress] = useState(site.address || '');

  useEffect(() => {
    // Keep local editable form state synchronized when the active site changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(site.name);
    setTimezone(site.timezone);
    setAddress(site.address || '');
  }, [site.name, site.timezone, site.address]);

  const mutation = useMutation({
    mutationFn: () =>
      api.put<Site>(`/sites/${site.id}`, {
        name: name.trim(),
        timezone,
        address: address.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      queryClient.invalidateQueries({ queryKey: ['site', site.id] });
      addToast('success', 'Site information updated');
    },
    onError: (err: Error) => addToast('error', err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { addToast('error', 'Site name is required'); return; }
    mutation.mutate();
  };

  return (
    <Section icon={Globe} title="Site Information" subtitle="Basic details about your museum site">
      <form onSubmit={handleSubmit} className="space-y-5 max-w-xl">
        <Field icon={Building2} label="Site Name" hint="The display name used throughout the admin panel">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={INPUT_CLASS}
            placeholder="Museum name"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field icon={Clock} label="Timezone" hint="Used for schedule calculations">
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className={INPUT_CLASS}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </Field>

          <Field icon={MapPin} label="Address">
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={INPUT_CLASS}
              placeholder="Building address"
            />
          </Field>
        </div>

        <div className="pt-2">
          <Button type="submit" loading={mutation.isPending}>
            Save Site Info
          </Button>
        </div>
      </form>
    </Section>
  );
}

// -- Integration Settings Form ----------------------------------------------

interface IntegrationConfig {
  mqttBrokerUrl: string;
  pjlinkPassword: string;
  daliGatewayHost: string;
  daliGatewayPort: number;
}

function parseConfig(config: Record<string, unknown> | null): IntegrationConfig {
  return {
    mqttBrokerUrl: typeof config?.mqttBrokerUrl === 'string' ? config.mqttBrokerUrl : '',
    pjlinkPassword: typeof config?.pjlinkPassword === 'string' ? config.pjlinkPassword : '',
    daliGatewayHost: typeof config?.daliGatewayHost === 'string' ? config.daliGatewayHost : '',
    daliGatewayPort: typeof config?.daliGatewayPort === 'number' ? config.daliGatewayPort : 8080,
  };
}

function IntegrationForm({ site }: { site: Site }) {
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();

  const [form, setForm] = useState<IntegrationConfig>(() => parseConfig(site.config));

  useEffect(() => {
    // Keep integration form fields synchronized when the site config changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(parseConfig(site.config));
  }, [site.config]);

  const updateField = <K extends keyof IntegrationConfig>(key: K, value: IntegrationConfig[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const mutation = useMutation({
    mutationFn: () => {
      const mergedConfig: Record<string, unknown> = {
        ...(site.config || {}),
        mqttBrokerUrl: form.mqttBrokerUrl.trim() || undefined,
        pjlinkPassword: form.pjlinkPassword.trim() || undefined,
        daliGatewayHost: form.daliGatewayHost.trim() || undefined,
        daliGatewayPort: form.daliGatewayPort,
      };
      return api.put<Site>(`/sites/${site.id}`, { config: mergedConfig });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      queryClient.invalidateQueries({ queryKey: ['site', site.id] });
      addToast('success', 'Integration settings updated');
    },
    onError: (err: Error) => addToast('error', err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <Section icon={Link2} title="Integrations" subtitle="External system connections and protocols">
      <form onSubmit={handleSubmit} className="space-y-5 max-w-xl">
        <Field icon={Wifi} label="MQTT Broker" hint="Message broker for device communication">
          <input
            type="text"
            value={form.mqttBrokerUrl}
            onChange={(e) => updateField('mqttBrokerUrl', e.target.value)}
            className={INPUT_CLASS}
            placeholder="mqtt://localhost:1883"
          />
        </Field>

        <Field icon={Key} label="PJLink Password" hint="Default password for projector control">
          <input
            type="text"
            value={form.pjlinkPassword}
            onChange={(e) => updateField('pjlinkPassword', e.target.value)}
            className={INPUT_CLASS}
            placeholder="PJLink password"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field icon={Radio} label="DALI Gateway Host">
            <input
              type="text"
              value={form.daliGatewayHost}
              onChange={(e) => updateField('daliGatewayHost', e.target.value)}
              className={INPUT_CLASS}
              placeholder="192.168.1.100"
            />
          </Field>

          <Field icon={Hash} label="DALI Gateway Port">
            <input
              type="number"
              value={form.daliGatewayPort}
              onChange={(e) => updateField('daliGatewayPort', Number(e.target.value) || 0)}
              className={INPUT_CLASS}
              placeholder="8080"
            />
          </Field>
        </div>

        <div className="pt-2">
          <Button type="submit" loading={mutation.isPending}>
            Save Integration Settings
          </Button>
        </div>
      </form>
    </Section>
  );
}

// -- Fallback Content Form --------------------------------------------------

interface PlaylistSummary {
  id: string;
  name: string;
  item_count?: number;
}

function FallbackContentForm({ site }: { site: Site }) {
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();

  const { data: playlists = [], isLoading } = useQuery({
    queryKey: ['playlists', site.id],
    queryFn: () => api.get<PlaylistSummary[]>(`/playlists?site_id=${site.id}`),
  });

  const rawFallback = site.config?.fallbackPlaylistId;
  const currentFallback = typeof rawFallback === 'string' ? rawFallback : '';
  const [selected, setSelected] = useState(currentFallback);

  useEffect(() => {
    // Resync when the active site (and thus its config) changes.
    setSelected(currentFallback);
  }, [currentFallback]);

  const mutation = useMutation({
    mutationFn: () => {
      const mergedConfig: Record<string, unknown> = { ...(site.config || {}) };
      if (selected) {
        mergedConfig.fallbackPlaylistId = selected;
      } else {
        delete mergedConfig.fallbackPlaylistId;
      }
      return api.put<Site>(`/sites/${site.id}`, { config: mergedConfig });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      queryClient.invalidateQueries({ queryKey: ['site', site.id] });
      addToast('success', 'Fallback content updated');
    },
    onError: (err: Error) => addToast('error', err.message),
  });

  return (
    <Section
      icon={Film}
      title="Fallback Content"
      subtitle="Plays on any device in this site when no app is assigned or its media fails to load"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
        className="space-y-5 max-w-xl"
      >
        <Field
          icon={Film}
          label="Fallback Playlist"
          hint="Shown instead of a blank screen on every device in this site that has no app assigned or whose media fails to load."
        >
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className={INPUT_CLASS}
            disabled={isLoading}
          >
            <option value="">None (show waiting screen)</option>
            {playlists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {typeof p.item_count === 'number' ? ` (${p.item_count} items)` : ''}
              </option>
            ))}
          </select>
        </Field>

        <div className="pt-2">
          <Button type="submit" loading={mutation.isPending}>
            Save Fallback Content
          </Button>
        </div>
      </form>
    </Section>
  );
}

// -- System Information (read-only) -----------------------------------------

const ADMIN_VERSION = __APP_VERSION__;

function SystemInfo({ site }: { site: Site }) {
  const [copied, setCopied] = useState(false);
  const [serverInfo, setServerInfo] = useState<{ version: string; gitHash: string; buildDate: string } | null>(null);

  useEffect(() => {
    fetch('/api/health').then(r => r.json())
      .then(d => { if (d.success) setServerInfo({ version: d.data.version, gitHash: d.data.gitHash, buildDate: d.data.buildDate }); })
      .catch(() => {});
  }, []);

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(site.id); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { /* clipboard may not be available */ }
  };

  return (
    <Section icon={Server} title="System" subtitle="Read-only system information">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Site ID */}
        <div className="sm:col-span-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">
            <Hash className="h-3 w-3" />
            Site ID
          </label>
          <div className="flex h-10 items-center gap-2 rounded-md border border-surface-200 bg-surface-50 px-3">
            <span className="text-sm text-surface-600 font-mono select-all truncate flex-1">{site.id}</span>
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copy site ID"
              className="admin-focus flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-surface-400 transition-colors hover:bg-surface-200/50 hover:text-surface-700"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Created */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">
            <Calendar className="h-3 w-3" />
            Created
          </label>
          <div className="flex h-10 items-center rounded-md border border-surface-200 bg-surface-50 px-3">
            <span className="text-sm text-surface-600">{formatDateTime(site.created_at)}</span>
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">
            <Activity className="h-3 w-3" />
            Status
          </label>
          <div className="flex h-10 items-center rounded-md border border-surface-200 bg-surface-50 px-3">
            <Badge variant={site.is_active ? 'success' : 'neutral'}>
              {site.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </div>

        {/* Server Version */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">
            <Server className="h-3 w-3" />
            Server
          </label>
          <div className="flex h-10 items-center rounded-md border border-surface-200 bg-surface-50 px-3">
            <span className="text-sm text-surface-600 font-mono">{serverInfo ? `v${serverInfo.version} (${serverInfo.gitHash})` : '—'}</span>
          </div>
        </div>

        {/* Admin Version */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">
            <Activity className="h-3 w-3" />
            Admin UI
          </label>
          <div className="flex h-10 items-center rounded-md border border-surface-200 bg-surface-50 px-3">
            <span className="text-sm text-surface-600 font-mono">v{ADMIN_VERSION} ({__GIT_HASH__})</span>
          </div>
        </div>
      </div>
    </Section>
  );
}

function DataTransferSection() {
  const addToast = useToastStore((s) => s.addToast);
  const userRole = useAuthStore((s) => s.user?.role);
  const [importFile, setImportFile] = useState<File | null>(null);

  const exportMutation = useMutation({
    mutationFn: async () => {
      const payload = await api.get<Record<string, unknown>>('/db-transfer/export');
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `museum-os-db-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => addToast('success', 'Database JSON export downloaded'),
    onError: (err: Error) => addToast('error', err.message),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!importFile) {
        throw new Error('Select a JSON file first');
      }
      const formData = new FormData();
      formData.append('file', importFile);
      return api.upload<{ imported: boolean; filename: string; size: number }>('/db-transfer/import', formData);
    },
    onSuccess: () => {
      addToast('success', 'Database JSON imported');
      setImportFile(null);
    },
    onError: (err: Error) => addToast('error', err.message),
  });

  const disabled = userRole !== 'super_admin';

  return (
    <Section
      icon={Database}
      title="Data Transfer"
      subtitle="Export and import PostgreSQL metadata as JSON for server-to-server moves"
    >
      <div className="space-y-5 max-w-2xl">
        <p className="text-sm text-surface-500">
          This transfers application metadata like devices, apps, schedules, users, playlists, and content metadata.
          Media files in <span className="font-mono">server/storage</span> still need to be copied separately.
        </p>

        {disabled && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            Only Super Admins can export or import database JSON.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3 rounded-md border border-surface-200 bg-surface-50 p-4">
            <div>
              <h3 className="text-sm font-semibold text-surface-800">Export JSON</h3>
              <p className="text-xs text-surface-500 mt-1">
                Download the current PostgreSQL application data as one JSON file.
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => exportMutation.mutate()}
              loading={exportMutation.isPending}
              disabled={disabled}
            >
              <Download className="h-4 w-4" />
              Export Database JSON
            </Button>
          </div>

          <div className="space-y-3 rounded-md border border-surface-200 bg-surface-50 p-4">
            <div>
              <h3 className="text-sm font-semibold text-surface-800">Import JSON</h3>
              <p className="text-xs text-surface-500 mt-1">
                Replace current PostgreSQL application data with a previously exported JSON file.
              </p>
            </div>
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              className={INPUT_CLASS}
              disabled={disabled || importMutation.isPending}
            />
            <Button
              variant="danger"
              onClick={() => {
                if (!window.confirm('Importing will replace the current database metadata. Continue?')) return;
                importMutation.mutate();
              }}
              loading={importMutation.isPending}
              disabled={disabled || !importFile}
            >
              <Upload className="h-4 w-4" />
              Import Database JSON
            </Button>
          </div>
        </div>
      </div>
    </Section>
  );
}

// -- Danger Zone ------------------------------------------------------------

function DangerZone() {
  return (
    <Section icon={Shield} title="Danger Zone" danger>
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <p className="text-sm font-medium text-red-700">Delete this site</p>
          <p className="text-xs text-red-500/70 mt-0.5">
            This site cannot be deleted from the UI. Contact your system administrator.
          </p>
        </div>
        <button
          disabled
          className="h-9 rounded-md border border-red-200 px-4 text-sm font-medium text-red-400 opacity-50 cursor-not-allowed"
        >
          Delete Site
        </button>
      </div>
    </Section>
  );
}

// -- Settings Page ----------------------------------------------------------

export function SettingsPage() {
  const activeSiteId = useSiteStore((s) => s.activeSiteId);

  const { data: site, isLoading, isError, error } = useQuery({
    queryKey: ['site', activeSiteId],
    queryFn: () => api.get<Site>(`/sites/${activeSiteId}`),
    enabled: !!activeSiteId,
  });

  if (!activeSiteId) {
    return (
      <EmptyState
        icon={Settings}
        title="No Site Selected"
        description="Select a site from the header to view its settings."
      />
    );
  }

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Spinner size="lg" className="text-surface-400" /></div>;
  }

  if (isError || !site) {
    return (
      <EmptyState
        icon={Settings}
        title="Failed to Load"
        description={(error as Error)?.message || 'Could not load site settings.'}
      />
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      {/* Page header */}
      <div>
        <nav className="flex items-center gap-1.5 text-xs text-surface-400 mb-1">
          <span>Admin</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-surface-600">Settings</span>
        </nav>
        <h1 className="text-2xl font-semibold tracking-tight text-surface-950">Site Settings</h1>
        <p className="mt-1 text-sm text-surface-500">
          Configure your museum site, integrations, and system preferences.
        </p>
      </div>

      <SiteInfoForm site={site} />
      <FallbackContentForm site={site} />
      <IntegrationForm site={site} />
      <SystemInfo site={site} />
      <DataTransferSection />
      <DangerZone />
    </div>
  );
}
