import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarRange, Plus, X } from 'lucide-react';
import { api } from '../lib/api';
import { useSiteStore } from '../stores/site';
import { useToastStore } from '../stores/toast';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import type { Exhibition } from '../lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ExhibitionStatus = 'active' | 'upcoming' | 'expired' | 'inactive';

function getExhibitionStatus(exhibition: Exhibition): ExhibitionStatus {
  const now = new Date();
  const start = new Date(exhibition.start_date);
  const end = new Date(exhibition.end_date);

  if (!exhibition.is_active) return 'inactive';
  if (now < start) return 'upcoming';
  if (now > end) return 'expired';
  return 'active';
}

const STATUS_CONFIG: Record<
  ExhibitionStatus,
  { variant: 'success' | 'info' | 'neutral' | 'warning'; label: string }
> = {
  active: { variant: 'success', label: 'Active' },
  upcoming: { variant: 'info', label: 'Upcoming' },
  expired: { variant: 'neutral', label: 'Expired' },
  inactive: { variant: 'warning', label: 'Inactive' },
};

function formatDateRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  return `${s.toLocaleDateString('en-US', opts)} - ${e.toLocaleDateString('en-US', opts)}`;
}

// Get today's date as YYYY-MM-DD for default form values
function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function nextWeekStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// Create Dialog
// ---------------------------------------------------------------------------

interface CreateDialogProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
  onSuccess: () => void;
}

function CreateDialog({ open, onClose, siteId, onSuccess }: CreateDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(nextWeekStr());
  const addToast = useToastStore((s) => s.addToast);

  const mutation = useMutation({
    mutationFn: () =>
      api.post<Exhibition>('/exhibitions', {
        site_id: siteId,
        name,
        description,
        start_date: startDate,
        end_date: endDate,
      }),
    onSuccess: () => {
      addToast('success', `Exhibition "${name}" created`);
      setName('');
      setDescription('');
      setStartDate(todayStr());
      setEndDate(nextWeekStr());
      onClose();
      onSuccess();
    },
    onError: (err: Error) => {
      addToast('error', err.message);
    },
  });

  const handleClose = useCallback(() => {
    if (mutation.isPending) return;
    setName('');
    setDescription('');
    setStartDate(todayStr());
    setEndDate(nextWeekStr());
    onClose();
  }, [mutation.isPending, onClose]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) return;
      mutation.mutate();
    },
    [name, mutation]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={handleClose} />
      <div className="relative bryzos-card rounded-3xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--glass-border)]">
          <h2 className="text-lg font-bold text-surface-900">Create Exhibition</h2>
          <button
            onClick={handleClose}
            disabled={mutation.isPending}
            className="h-7 w-7 inline-flex items-center justify-center rounded-xl text-surface-400 hover:text-surface-600 hover:bg-surface-100 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-4 space-y-5">
            {/* Name */}
            <div>
              <label className="block text-sm font-semibold text-surface-600 mb-1.5">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Exhibition name"
                autoFocus
                className="h-10 w-full px-3 rounded-xl border border-surface-300 text-base text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-semibold text-surface-600 mb-1.5">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                rows={2}
                className="w-full px-3 py-2 rounded-xl border border-surface-300 text-base text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
              />
            </div>

            {/* Date range */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-surface-600 mb-1.5">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-10 w-full px-3 rounded-xl border border-surface-300 text-base text-surface-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-surface-600 mb-1.5">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-10 w-full px-3 rounded-xl border border-surface-300 text-base text-surface-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--glass-border)]">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleClose}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!name.trim()}
              loading={mutation.isPending}
            >
              Create
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function ExhibitionListPage() {
  const navigate = useNavigate();
  const activeSiteId = useSiteStore((s) => s.activeSiteId);
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);

  const { data: exhibitions = [], isLoading } = useQuery({
    queryKey: ['exhibitions', activeSiteId],
    queryFn: () => api.get<Exhibition[]>(`/exhibitions?site_id=${activeSiteId}`),
    enabled: !!activeSiteId,
  });

  if (!activeSiteId) {
    return (
      <EmptyState
        icon={CalendarRange}
        title="No site selected"
        description="Select a site from the header to manage exhibitions."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-surface-900 leading-tight">Exhibitions</h1>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Create Exhibition
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && exhibitions.length === 0 && (
        <EmptyState
          icon={CalendarRange}
          title="No exhibitions"
          description="Exhibitions assign content to devices for a date range. Create one to schedule what plays during a show."
          action={
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Create Exhibition
            </Button>
          }
        />
      )}

      {/* Table */}
      {!isLoading && exhibitions.length > 0 && (
        <div className="bryzos-card rounded-3xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-surface-50 border-b border-[var(--glass-border)]">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider hidden sm:table-cell">
                  Date Range
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider hidden md:table-cell">
                  Assignments
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {exhibitions.map((exhibition) => {
                const status = getExhibitionStatus(exhibition);
                const cfg = STATUS_CONFIG[status];

                return (
                  <tr
                    key={exhibition.id}
                    onClick={() => navigate(`/exhibitions/${exhibition.id}`)}
                    className="hover:bg-surface-50 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded bg-surface-100 flex items-center justify-center shrink-0">
                          <CalendarRange className="h-3.5 w-3.5 text-surface-400" />
                        </div>
                        <div>
                          <div className="text-base font-medium text-surface-900 truncate max-w-[220px]">
                            {exhibition.name}
                          </div>
                          {exhibition.description && (
                            <div className="text-xs text-surface-400 truncate max-w-[220px]">
                              {exhibition.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-base text-surface-600 hidden sm:table-cell">
                      {formatDateRange(exhibition.start_date, exhibition.end_date)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={cfg.variant}>{cfg.label}</Badge>
                    </td>
                    <td className="px-3 py-2 text-base text-surface-500 hidden md:table-cell">
                      {exhibition.assignment_count ?? 0}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer count */}
      {!isLoading && exhibitions.length > 0 && (
        <div className="text-base text-surface-400">
          {exhibitions.length} exhibition{exhibitions.length === 1 ? '' : 's'}
        </div>
      )}

      {/* Create dialog */}
      <CreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        siteId={activeSiteId}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['exhibitions', activeSiteId] });
        }}
      />
    </div>
  );
}
