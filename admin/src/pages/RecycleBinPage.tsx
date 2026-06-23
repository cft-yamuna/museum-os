import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSiteStore } from '../stores/site';
import { useToastStore } from '../stores/toast';
import { api } from '../lib/api';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import type { App } from '../lib/types';
import {
  Trash2, RotateCcw, Search, X, AppWindow, Volume2, Video, Image,
  PlayCircle, Map, FolderOpen, Radio, Layers, LayoutGrid, Wrench, Clock, Navigation,
} from 'lucide-react';
import clsx from 'clsx';

/* ── template metadata ── */

const TPL: Record<string, { name: string; icon: typeof AppWindow; color: string }> = {
  'app01-monophone-audio':       { name: 'Monophone Audio',    icon: Volume2,    color: '#c2185b' },
  'app01-monophone-audio-multi': { name: 'Audio Multi-Button', icon: Volume2,    color: '#c2185b' },
  'app02-monophone-video':       { name: 'Monophone Video',    icon: Video,      color: '#1976d2' },
  'app03-touch-carousel':        { name: 'Touch Carousel',     icon: Image,      color: '#2e7d32' },
  'app04-media-loop':            { name: 'Media Loop',         icon: PlayCircle, color: '#e65100' },
  'app05-interactive-map':       { name: 'Interactive Map',    icon: Map,        color: '#00838f' },
  'app06-media-browser':         { name: 'Media Browser',      icon: FolderOpen, color: '#ad1457' },
  proximity:                     { name: 'Proximity',          icon: Radio,      color: '#d84315' },
  'touch-scroll':                { name: 'Touch Scroll',       icon: Layers,     color: '#00695c' },
  'multi-screen':                { name: 'Multi-Screen',       icon: LayoutGrid, color: '#4527a0' },
  diagnostics:                   { name: 'Diagnostics',        icon: Wrench,     color: '#546e7a' },
  'custom01-hilight-timeline':   { name: 'Museum OS Timeline',  icon: Clock,      color: '#5072b6' },
  'custom01-wipro-timeline':     { name: 'Museum OS Timeline',  icon: Clock,      color: '#5072b6' },
  'custom08-museum-kiosk':       { name: 'Museum Kiosk',        icon: Navigation, color: '#059669' },
};

function tpl(type: string) {
  return TPL[type] || { name: type, icon: AppWindow, color: '#546e7a' };
}

function daysLeft(deletedAt: string): number {
  const deleted = new Date(deletedAt).getTime();
  const now = Date.now();
  const elapsed = Math.floor((now - deleted) / 86400000);
  return Math.max(0, 30 - elapsed);
}

function fmtDeletedDate(ts: string) {
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ── page ── */

export function RecycleBinPage() {
  const siteId = useSiteStore((s) => s.activeSiteId);
  const toast = useToastStore((s) => s.addToast);
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [permDelTarget, setPermDelTarget] = useState<App | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<App | null>(null);

  const { data: trashedApps = [], isLoading } = useQuery({
    queryKey: ['apps', siteId, 'trash'],
    queryFn: () => api.get<App[]>(`/apps?site_id=${siteId}&include_deleted=true`),
    enabled: !!siteId,
  });

  const restoreMut = useMutation({
    mutationFn: (id: string) => api.post(`/apps/${id}/restore`),
    onSuccess: () => {
      toast('success', 'App restored');
      qc.invalidateQueries({ queryKey: ['apps', siteId] });
      setRestoreTarget(null);
    },
    onError: (e) => toast('error', e instanceof Error ? e.message : 'Restore failed'),
  });

  const permDeleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/apps/${id}/permanent`),
    onSuccess: () => {
      toast('success', 'Permanently deleted');
      qc.invalidateQueries({ queryKey: ['apps', siteId] });
      setPermDelTarget(null);
    },
    onError: (e) => toast('error', e instanceof Error ? e.message : 'Delete failed'),
  });

  const filtered = useMemo(() => {
    if (!q) return trashedApps;
    const s = q.toLowerCase();
    return trashedApps.filter(a => a.name.toLowerCase().includes(s) || tpl(a.template_type).name.toLowerCase().includes(s));
  }, [trashedApps, q]);

  if (!siteId) return <EmptyState icon={Trash2} title="No Site Selected" description="Select a site to view recycle bin." />;

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* header */}
      <div>
        <h1 className="font-bold text-surface-900" style={{ fontSize: '32px' }}>Recycle Bin</h1>
        <p className="text-surface-400 mt-0.5" style={{ fontSize: '14px' }}>
          Deleted apps are kept for 30 days before being permanently removed
        </p>
      </div>

      {/* search */}
      {!isLoading && trashedApps.length > 0 && (
        <div className="flex items-center gap-3 card-bg rounded-2xl border border-surface-200 px-4 py-3">
          <Search className="h-4 w-4 text-surface-400 shrink-0" />
          <input
            value={q} onChange={e => setQ(e.target.value)}
            className="flex-1 bg-transparent text-sm text-surface-800 placeholder:text-surface-400 focus:outline-none"
            placeholder="Search deleted apps..."
          />
          {q && <button onClick={() => setQ('')} className="text-surface-400 hover:text-surface-600"><X className="h-4 w-4" /></button>}
        </div>
      )}

      {isLoading && <div className="flex justify-center py-20"><Spinner size="lg" className="text-surface-400" /></div>}

      {!isLoading && trashedApps.length === 0 && (
        <div className="rounded-2xl card-bg border border-surface-200 p-14 text-center">
          <div className="h-14 w-14 rounded-2xl bg-surface-100 flex items-center justify-center mx-auto mb-5">
            <Trash2 className="h-7 w-7 text-surface-400" />
          </div>
          <h3 className="font-bold text-surface-900 mb-2" style={{ fontSize: '18px' }}>Recycle Bin is Empty</h3>
          <p className="text-surface-500" style={{ fontSize: '14px' }}>Deleted apps will appear here for 30 days.</p>
        </div>
      )}

      {!isLoading && trashedApps.length > 0 && filtered.length === 0 && (
        <EmptyState icon={Search} title="No results" description="Try a different search." action={
          <button onClick={() => setQ('')} className="h-9 px-4 rounded-lg border border-surface-200 text-sm text-surface-600 hover:bg-surface-50">Clear</button>
        } />
      )}

      {/* Card grid */}
      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((app) => {
            const t = tpl(app.template_type);
            const Icon = t.icon;
            const remaining = daysLeft((app as any).deleted_at || app.updated_at);

            return (
              <div key={app.id} className="card-bg rounded-2xl border border-surface-200 p-5 opacity-80 hover:opacity-100 transition-opacity">
                {/* Top: Icon + name */}
                <div className="flex items-start gap-3 mb-4">
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${t.color}12`, color: t.color }}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-surface-900 truncate" style={{ fontSize: '16px' }}>{app.name}</h3>
                    <p className="text-surface-400" style={{ fontSize: '13px' }}>{t.name}</p>
                  </div>
                </div>

                {/* Info */}
                <div className="space-y-2 mb-5">
                  <div className="flex items-center justify-between" style={{ fontSize: '14px' }}>
                    <span className="text-surface-500">Deleted</span>
                    <span className="font-medium text-surface-700">{fmtDeletedDate((app as any).deleted_at || app.updated_at)}</span>
                  </div>
                  <div className="flex items-center justify-between" style={{ fontSize: '14px' }}>
                    <span className="text-surface-500">Auto-delete in</span>
                    <span className={clsx(
                      'font-semibold',
                      remaining <= 7 ? 'text-red-500' : remaining <= 14 ? 'text-amber-500' : 'text-surface-700',
                    )}>
                      {remaining} day{remaining !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setRestoreTarget(app)}
                    className="flex-1 h-9 flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 font-medium text-emerald-600 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-500/10 transition-colors"
                    style={{ fontSize: '14px' }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restore
                  </button>
                  <button
                    onClick={() => setPermDelTarget(app)}
                    className="flex-1 h-9 flex items-center justify-center gap-1.5 rounded-xl border border-red-200 font-medium text-red-500 hover:bg-red-50 dark:border-red-500/30 dark:hover:bg-red-500/10 transition-colors"
                    style={{ fontSize: '14px' }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Forever
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Restore confirmation */}
      <ConfirmDialog
        open={!!restoreTarget}
        title="Restore App?"
        message={`Restore "${restoreTarget?.name || ''}" back to your active apps?`}
        confirmLabel="Restore"
        variant="primary"
        loading={restoreMut.isPending}
        onConfirm={() => { if (restoreTarget) restoreMut.mutate(restoreTarget.id); }}
        onCancel={() => setRestoreTarget(null)}
      />

      {/* Permanent delete confirmation */}
      <ConfirmDialog
        open={!!permDelTarget}
        title="Delete Permanently?"
        message={`This will permanently delete "${permDelTarget?.name || ''}". This action cannot be undone.`}
        confirmLabel="Delete Forever"
        variant="danger"
        loading={permDeleteMut.isPending}
        onConfirm={() => { if (permDelTarget) permDeleteMut.mutate(permDelTarget.id); }}
        onCancel={() => setPermDelTarget(null)}
      />
    </div>
  );
}
