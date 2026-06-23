import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSiteStore } from '../stores/site';
import { useToastStore } from '../stores/toast';
import { api } from '../lib/api';
import { Spinner } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import type { App } from '../lib/types';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Search, AppWindow, Plus, X, Volume2, Video, Image, PlayCircle,
  Map, FolderOpen, Radio, Layers, LayoutGrid, Wrench, Sparkles,
  ChevronDown, Trash2, Monitor, ArrowRight, Clock, Navigation,
} from 'lucide-react';
import clsx from 'clsx';

/* ── template metadata ── */

const TPL: Record<string, { name: string; icon: typeof AppWindow; color: string }> = {
  'app01-monophone-audio':       { name: 'Monophone Audio',    icon: Volume2,    color: '#2563eb' },
  'app01-monophone-audio-multi': { name: 'Audio Multi-Button', icon: Volume2,    color: '#2563eb' },
  'app02-monophone-video':       { name: 'Monophone Video',    icon: Video,      color: '#2563eb' },
  'app03-touch-carousel':        { name: 'Touch Carousel',     icon: Image,      color: '#059669' },
  'app04-media-loop':            { name: 'Media Loop',         icon: PlayCircle, color: '#d97706' },
  'app05-interactive-map':       { name: 'Interactive Map',    icon: Map,        color: '#2563eb' },
  'app06-media-browser':         { name: 'Media Browser',      icon: FolderOpen, color: '#2563eb' },
  proximity:                     { name: 'Proximity',          icon: Radio,      color: '#d97706' },
  'touch-scroll':                { name: 'Touch Scroll',       icon: Layers,     color: '#059669' },
  'multi-screen':                { name: 'Multi-Screen',       icon: LayoutGrid, color: '#334155' },
  diagnostics:                   { name: 'Diagnostics',        icon: Wrench,     color: '#64748b' },
  'custom07-osc':                { name: 'OSC Trigger',         icon: Radio,      color: '#d97706' },
  'custom01-hilight-timeline':   { name: 'Museum OS Timeline',  icon: Clock,      color: '#2563eb' },
  'custom01-wipro-timeline':     { name: 'Museum OS Timeline',  icon: Clock,      color: '#2563eb' },
  'custom08-museum-kiosk':       { name: 'Museum Kiosk',        icon: Navigation, color: '#059669' },
};

function tpl(type: string) {
  return TPL[type] || { name: type, icon: AppWindow, color: '#546e7a' };
}

function groupKey(t: string) {
  if (t === 'custom01-wipro-timeline') return 'custom01-hilight-timeline';
  return t === 'app01-monophone-audio-multi' ? 'app01-monophone-audio' : t;
}

const GROUP_ORDER = [
  'app01-monophone-audio', 'app02-monophone-video', 'app03-touch-carousel', 'app04-media-loop',
  'app05-interactive-map', 'app06-media-browser', 'proximity', 'touch-scroll', 'multi-screen',
  'custom01-hilight-timeline', 'custom01-wipro-timeline', 'custom08-museum-kiosk', 'diagnostics',
];

function fmtDate(ts: string) {
  const d = new Date(ts), now = new Date(), days = Math.floor((now.getTime() - d.getTime()) / 864e5);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/* ── page ── */

export function AppListPage() {
  const nav = useNavigate();
  const siteId = useSiteStore((s) => s.activeSiteId);
  const toast = useToastStore((s) => s.addToast);
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [delTarget, setDelTarget] = useState<App | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (k: string) =>
    setCollapsed((p) => {
      const next = new Set(p);
      if (next.has(k)) {
        next.delete(k);
      } else {
        next.add(k);
      }
      return next;
    });

  const delMut = useMutation({
    mutationFn: (id: string) => api.delete(`/apps/${id}`),
    onSuccess: () => {
      toast('success', 'Deleted');
      qc.invalidateQueries({ queryKey: ['apps', siteId] });
      setDelTarget(null);
    },
    onError: (e) => toast('error', e instanceof Error ? e.message : 'Failed'),
  });

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ['apps', siteId],
    queryFn: () => api.get<App[]>(`/apps?site_id=${siteId}`),
    enabled: !!siteId,
  });

  const filtered = useMemo(() => {
    let list = apps;
    if (q) {
      const s = q.toLowerCase();
      list = list.filter(
        (a) => a.name.toLowerCase().includes(s) || tpl(a.template_type).name.toLowerCase().includes(s)
      );
    }
    if (statusFilter === 'active') list = list.filter((a) => a.is_active);
    if (statusFilter === 'inactive') list = list.filter((a) => !a.is_active);
    return list;
  }, [apps, q, statusFilter]);

  const groups = useMemo(() => {
    const m: Record<string, App[]> = {};
    filtered.forEach((a) => { const k = groupKey(a.template_type); (m[k] ||= []).push(a); });
    const out: [string, App[]][] = [];
    for (const k of GROUP_ORDER) if (m[k]) { out.push([k, m[k]]); delete m[k]; }
    for (const [k, v] of Object.entries(m)) out.push([k, v]);
    return out;
  }, [filtered]);

  const isOpen = (k: string) => (q ? true : !collapsed.has(k));

  if (!siteId) return <EmptyState icon={AppWindow} title="No Site Selected" description="Select a site to view apps." />;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-surface-500">Content Systems</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-surface-950">Apps</h1>
          <p className="mt-1 text-sm text-surface-500">
            Manage application templates and display assignments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => nav('/recycle-bin')}
            aria-label="Open recycle bin"
            className="admin-focus flex h-10 w-10 items-center justify-center rounded-md border border-surface-300 text-surface-500 transition-colors hover:bg-surface-50 hover:text-surface-800"
            title="Recycle Bin"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <Button onClick={() => nav('/apps/new')}>
            <Plus className="h-4 w-4" />
            Add App
          </Button>
        </div>
      </div>

      {/* ── Search + filter ── */}
      {!isLoading && apps.length > 0 && (
        <div className="admin-card flex items-center gap-3 px-4 py-2.5">
          <Search className="h-4 w-4 text-surface-400 shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1 bg-transparent text-sm text-surface-800 placeholder:text-surface-400 focus:outline-none"
            placeholder="Search apps..."
          />
          {q && (
            <button type="button" aria-label="Clear search" onClick={() => setQ('')} className="admin-focus rounded p-1 text-surface-400 transition-colors hover:text-surface-700">
              <X className="h-4 w-4" />
            </button>
          )}
          <div className="w-px h-5 bg-surface-200 mx-1" />
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="appearance-none rounded-md bg-transparent py-1 pl-2 pr-6 text-sm font-medium text-surface-700 hover:bg-surface-50 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-surface-400 pointer-events-none" />
          </div>
        </div>
      )}

      {/* ── Loading ── */}
      {isLoading && (
        <div className="flex justify-center py-20">
          <Spinner size="lg" className="text-surface-400" />
        </div>
      )}

      {/* ── Empty: no apps ── */}
      {!isLoading && apps.length === 0 && (
        <div className="admin-card p-12 text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-md border border-surface-200 bg-surface-50">
            <Sparkles className="h-6 w-6 text-primary-700" />
          </div>
          <h3 className="text-lg font-bold text-surface-900 mb-2">No Apps Yet</h3>
          <p className="text-sm text-surface-500 max-w-sm mx-auto mb-6">
            Pick a template, configure it, then assign devices.
          </p>
          <Button onClick={() => nav('/apps/new')}>
            <Plus className="h-4 w-4" /> Create First App
          </Button>
        </div>
      )}

      {/* ── Empty: no results ── */}
      {!isLoading && apps.length > 0 && filtered.length === 0 && (
        <EmptyState
          icon={Search}
          title="No results"
          description="Try a different search or filter."
          action={
            <button
              onClick={() => { setQ(''); setStatusFilter('all'); }}
              className="h-9 rounded-md border border-surface-300 px-4 text-sm font-semibold text-surface-700 transition-colors hover:bg-surface-50"
            >
              Clear filters
            </button>
          }
        />
      )}

      {/* ── Grouped card grid ── */}
      {!isLoading && filtered.length > 0 && (
        <div className="space-y-7">
          {groups.map(([gk, gApps]) => {
            const t = tpl(gk);
            const Icon = t.icon;
            const open = isOpen(gk);

            return (
              <div key={gk}>
                {/* Group header */}
                <button
                  onClick={() => toggle(gk)}
                  className="flex items-center gap-2.5 mb-4 group w-full text-left"
                >
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors duration-200"
                    style={{ background: `${t.color}14`, color: t.color }}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <span
                    className="font-semibold text-surface-800 group-hover:text-surface-900 transition-colors"
                    style={{ fontSize: '16px' }}
                  >
                    {t.name}
                  </span>
                  <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded px-1.5 text-[10px] font-bold text-surface-500 bg-surface-100">
                    {gApps.length}
                  </span>
                  <motion.span
                    className="ml-auto"
                    animate={{ rotate: open ? 0 : -90 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDown className="h-4 w-4 text-surface-300 group-hover:text-surface-400 transition-colors" />
                  </motion.span>
                </button>

                {/* Card grid */}
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="grid grid-cols-1 gap-3 pb-1 sm:grid-cols-2 lg:grid-cols-3">
                        {gApps.map((app) => (
                          <AppCard
                            key={app.id}
                            app={app}
                            onConfigure={() => nav(`/apps/${app.id}`)}
                            onDelete={() => setDelTarget(app)}
                          />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!delTarget}
        title="Delete App?"
        message={`Permanently delete "${delTarget?.name || ''}"? Assigned devices will be unassigned.`}
        confirmLabel="Delete"
        variant="danger"
        loading={delMut.isPending}
        onConfirm={() => { if (delTarget) delMut.mutate(delTarget.id); }}
        onCancel={() => setDelTarget(null)}
      />
    </div>
  );
}

/* ── App card ── */

function AppCard({
  app,
  onConfigure,
  onDelete,
}: {
  app: App;
  onConfigure: () => void;
  onDelete: () => void;
}) {
  const t = tpl(app.template_type);
  const Icon = t.icon;

  return (
    <div
      onClick={onConfigure}
      className="admin-card group flex cursor-pointer flex-col overflow-hidden transition-colors duration-200 hover:border-primary-300 hover:bg-surface-50"
    >
      {/* Colored top accent bar */}
      <div className="h-[2px] w-full shrink-0" style={{ background: t.color }} />

      {/* Card header: icon + name + status */}
      <div className="px-4 pt-4 pb-3 flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition-colors duration-200"
          style={{ background: `${t.color}12`, color: t.color }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-surface-900 truncate text-[15px] leading-snug group-hover:text-primary-700 transition-colors">
            {app.name}
          </h3>
          <p className="text-[12px] text-surface-400 mt-0.5 leading-tight">{t.name}</p>
        </div>
        <span
          className={clsx(
            'mt-0.5 shrink-0 rounded px-2 py-0.5 text-[10px] font-bold',
            app.is_active
              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300'
              : 'bg-surface-100 text-surface-500'
          )}
        >
          {app.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>

      {/* Compact info row */}
      <div className="px-4 pb-4 flex items-center gap-1.5 text-[12px] text-surface-400">
        <Monitor className="h-3 w-3 shrink-0 text-surface-300" />
        <span className="font-medium text-surface-600">{app.device_count || 0}</span>
        <span>device{(app.device_count || 0) !== 1 ? 's' : ''}</span>
        <span className="mx-1 text-surface-200">/</span>
        <span>{fmtDate(app.updated_at)}</span>
      </div>

      {/* Spacer pushes action bar to bottom */}
      <div className="flex-1" />

      {/* Action bar */}
      <div className="flex border-t border-surface-100 mt-auto">
        <button
          onClick={(e) => { e.stopPropagation(); onConfigure(); }}
          className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-surface-500 transition-colors hover:bg-surface-50 hover:text-surface-900"
        >
          Configure
          <ArrowRight className="h-3 w-3 opacity-60" />
        </button>
        <div className="w-px bg-surface-100" />
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          aria-label={`Delete ${app.name}`}
          className="flex w-11 items-center justify-center text-surface-400 transition-colors hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-500/10 dark:hover:text-red-300"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
