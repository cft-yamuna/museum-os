import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Cpu, Plus, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useToastStore } from '../stores/toast';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';

interface CatalogPart {
  id: string;
  part_number: string;
  brand: string | null;
  model: string | null;
  category: string | null;
  platform: string | null;
  protocol: string | null;
  driver_family: string | null;
  default_port: number | null;
  capabilities: string[] | string | null;
  notes: string | null;
}

interface CatalogResponse {
  parts: CatalogPart[];
  driver_families: string[];
}

const EMPTY_FORM = {
  part_number: '',
  brand: '',
  model: '',
  category: 'display',
  platform: '',
  protocol: '',
  driver_family: '',
  default_port: '',
};

function parseCaps(c: CatalogPart['capabilities']): string[] {
  if (Array.isArray(c)) return c;
  if (typeof c === 'string') {
    try {
      const v = JSON.parse(c);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function HardwareCatalogPage() {
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const role = useAuthStore((s) => s.user?.role);
  const canEdit = role === 'super_admin' || role === 'site_admin';
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data, isLoading } = useQuery<CatalogResponse>({
    queryKey: ['catalog'],
    queryFn: () => api.get<CatalogResponse>('/catalog'),
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/catalog', body),
    onSuccess: () => {
      addToast('success', 'Part added to catalog');
      setShowForm(false);
      setForm(EMPTY_FORM);
      qc.invalidateQueries({ queryKey: ['catalog'] });
    },
    onError: (e: Error) => addToast('error', e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/catalog/${id}`),
    onSuccess: () => {
      addToast('success', 'Part removed');
      qc.invalidateQueries({ queryKey: ['catalog'] });
    },
    onError: (e: Error) => addToast('error', e.message),
  });

  const submit = () => {
    if (!form.part_number.trim()) {
      addToast('error', 'Part number is required');
      return;
    }
    createMut.mutate({
      part_number: form.part_number.trim(),
      brand: form.brand || undefined,
      model: form.model || undefined,
      category: form.category || undefined,
      platform: form.platform || undefined,
      protocol: form.protocol || undefined,
      driver_family: form.driver_family || undefined,
      default_port: form.default_port ? Number(form.default_port) : undefined,
    });
  };

  const parts = data?.parts ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 flex items-center gap-2">
            <Cpu className="h-6 w-6" /> Hardware Catalog
          </h1>
          <p className="text-base text-surface-500">Part numbers, control protocols and driver families across the fleet.</p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> Add part
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : parts.length === 0 ? (
        <EmptyState icon={Cpu} title="No catalog parts" description="Add the hardware part numbers your museum deploys." />
      ) : (
        <div className="bryzos-card rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-left text-surface-500 border-b border-[var(--glass-border)]">
              <tr>
                <th className="px-4 py-2.5 font-medium">Part</th>
                <th className="px-4 py-2.5 font-medium">Brand / Model</th>
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 font-medium">Platform</th>
                <th className="px-4 py-2.5 font-medium">Protocol</th>
                <th className="px-4 py-2.5 font-medium">Driver</th>
                <th className="px-4 py-2.5 font-medium">Port</th>
                <th className="px-4 py-2.5 font-medium">Capabilities</th>
                {canEdit && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => (
                <tr key={p.id} className="border-b border-[var(--glass-border)] last:border-0">
                  <td className="px-4 py-2.5 font-mono text-surface-900">{p.part_number}</td>
                  <td className="px-4 py-2.5 text-surface-700">{[p.brand, p.model].filter(Boolean).join(' ') || '—'}</td>
                  <td className="px-4 py-2.5 text-surface-700 capitalize">{p.category || '—'}</td>
                  <td className="px-4 py-2.5 text-surface-700">{p.platform || '—'}</td>
                  <td className="px-4 py-2.5 text-surface-700">{p.protocol || '—'}</td>
                  <td className="px-4 py-2.5">{p.driver_family ? <Badge variant="info">{p.driver_family}</Badge> : '—'}</td>
                  <td className="px-4 py-2.5 text-surface-700">{p.default_port ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {parseCaps(p.capabilities).map((c) => (
                        <span key={c} className="px-1.5 py-0.5 rounded bg-surface-100 text-surface-600 text-xs">{c}</span>
                      ))}
                    </div>
                  </td>
                  {canEdit && (
                    <td className="px-4 py-2.5 text-right">
                      <button
                        className="h-7 w-7 inline-flex items-center justify-center rounded-xl text-surface-400 hover:text-red-500 hover:bg-red-500/10"
                        onClick={() => deleteMut.mutate(p.id)}
                        title="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowForm(false)} />
          <div className="relative bryzos-card rounded-3xl shadow-xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--glass-border)]">
              <h2 className="text-lg font-bold text-surface-900">Add catalog part</h2>
              <button className="h-7 w-7 inline-flex items-center justify-center rounded-xl text-surface-400 hover:bg-surface-100" onClick={() => setShowForm(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3">
              {([
                ['part_number', 'Part number *'],
                ['brand', 'Brand'],
                ['model', 'Model'],
                ['category', 'Category'],
                ['platform', 'Platform / OS'],
                ['protocol', 'Protocol'],
                ['default_port', 'Default port'],
              ] as const).map(([key, label]) => (
                <label key={key} className="text-sm space-y-1">
                  <span className="text-surface-500">{label}</span>
                  <input
                    className="w-full px-2.5 py-1.5 rounded-xl border border-[var(--glass-border)] bg-transparent"
                    value={(form as Record<string, string>)[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                </label>
              ))}
              <label className="text-sm space-y-1">
                <span className="text-surface-500">Driver family</span>
                <select
                  className="w-full px-2.5 py-1.5 rounded-xl border border-[var(--glass-border)] bg-transparent"
                  value={form.driver_family}
                  onChange={(e) => setForm({ ...form, driver_family: e.target.value })}
                >
                  <option value="">—</option>
                  {(data?.driver_families ?? []).map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--glass-border)]">
              <Button variant="secondary" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={submit} loading={createMut.isPending}>Add</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
