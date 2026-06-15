import { useState, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Search, Plus, Users, Trash2, Power, PowerOff, RotateCcw, X, Pencil } from 'lucide-react';
import { api } from '../lib/api';
import { useSiteStore } from '../stores/site';
import { useToastStore } from '../stores/toast';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import type { Device, DeviceGroup } from '../lib/types';

// Types
interface GroupWithCount extends DeviceGroup { member_count: number }
interface GroupDetail extends DeviceGroup { members: Device[] }
interface GroupFormData { name: string; description: string }
type BulkActionType = 'power_on' | 'power_off' | 'restart';

const EMPTY_FORM: GroupFormData = { name: '', description: '' };

const BULK_LABELS: Record<BulkActionType, string> = {
  power_on: 'Power On', power_off: 'Power Off', restart: 'Restart',
};

// Status dot (shared with device pages)
const STATUS_CFG: Record<Device['status'], { dot: string; bg: string; text: string; label: string }> = {
  online: { dot: 'bg-emerald-400', bg: 'bg-emerald-500/5', text: 'text-emerald-500', label: 'Online' },
  error: { dot: 'bg-red-400', bg: 'bg-red-500/5', text: 'text-red-500', label: 'Error' },
  offline: { dot: 'bg-surface-300', bg: 'bg-surface-100', text: 'text-surface-500', label: 'Offline' },
  unavailable: { dot: 'bg-surface-300', bg: 'bg-surface-100', text: 'text-surface-500', label: 'Unavailable' },
  restarting: { dot: 'bg-blue-400', bg: 'bg-blue-500/5', text: 'text-blue-500', label: 'Restarting' },
};

function StatusDot({ status }: { status: Device['status'] }) {
  const c = STATUS_CFG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-sm font-medium ${c.bg} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />{c.label}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Close button shared style
const closeBtnCls = 'h-7 w-7 inline-flex items-center justify-center rounded-xl text-surface-400 hover:text-surface-600 hover:bg-surface-100 disabled:opacity-50';
const iconBtnCls = (color: string) => `h-7 w-7 inline-flex items-center justify-center rounded-xl ${color}`;

// ---------------------------------------------------------------------------
// Confirm Dialog
// ---------------------------------------------------------------------------
function ConfirmDialog({ open, title, message, confirmLabel, variant = 'danger', loading, onConfirm, onCancel }: {
  open: boolean; title: string; message: string; confirmLabel: string;
  variant?: 'danger' | 'primary'; loading?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={loading ? undefined : onCancel} />
      <div className="relative bryzos-card rounded-3xl shadow-xl w-full max-w-sm mx-4">
        <div className="p-4 space-y-5">
          <h2 className="text-lg font-bold text-surface-900">{title}</h2>
          <p className="text-base text-surface-600">{message}</p>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--glass-border)]">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button variant={variant} size="sm" onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Group Form Dialog (Create / Edit)
// ---------------------------------------------------------------------------
function GroupFormDialog({ open, editGroup, loading, onSubmit, onClose }: {
  open: boolean; editGroup: GroupWithCount | null; loading: boolean;
  onSubmit: (d: GroupFormData) => void; onClose: () => void;
}) {
  const [form, setForm] = useState<GroupFormData>(EMPTY_FORM);
  const [nameError, setNameError] = useState('');

  useState(() => {
    setForm(editGroup ? { name: editGroup.name, description: editGroup.description || '' } : { ...EMPTY_FORM });
    setNameError('');
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setNameError('Name is required'); return; }
    setNameError('');
    onSubmit(form);
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={loading ? undefined : onClose} />
      <div className="relative bryzos-card rounded-3xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--glass-border)]">
          <h2 className="text-lg font-bold text-surface-900">{editGroup ? 'Edit Group' : 'New Group'}</h2>
          <button onClick={onClose} disabled={loading} className={closeBtnCls}><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-surface-600 mb-1.5">Name <span className="text-red-500">*</span></label>
            <input type="text" value={form.name} autoFocus
              onChange={(e) => { setForm((p) => ({ ...p, name: e.target.value })); if (nameError) setNameError(''); }}
              className={`h-10 w-full px-3.5 rounded-xl border ${nameError ? 'border-red-400' : 'border-surface-300'} card-bg text-base text-surface-700 placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-primary-500`}
              placeholder="Group name" />
            {nameError && <p className="text-sm text-red-500 mt-0.5">{nameError}</p>}
          </div>
          <div>
            <label className="block text-sm font-semibold text-surface-600 mb-1.5">Description</label>
            <input type="text" value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              className="h-10 w-full px-3.5 rounded-xl border border-surface-300 card-bg text-base text-surface-700 placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="Optional description" />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={loading} type="button">Cancel</Button>
            <Button size="sm" type="submit" loading={loading}>{editGroup ? 'Save Changes' : 'Create Group'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manage Members Dialog
// ---------------------------------------------------------------------------
function ManageMembersDialog({ open, group, allDevices, loading, onSave, onClose }: {
  open: boolean; group: GroupDetail | null; allDevices: Device[];
  loading: boolean; onSave: (toAdd: string[], toRemove: string[]) => void; onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  useState(() => {
    setSelected(group ? new Set(group.members.map((m) => m.id)) : new Set());
    setSearch('');
  });

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    if (!search) return allDevices;
    const q = search.toLowerCase();
    return allDevices.filter((d) => d.display_name.toLowerCase().includes(q));
  }, [allDevices, search]);

  if (!open || !group) return null;

  const currentIds = new Set(group.members.map((m) => m.id));
  const hasChanges = Array.from(selected).some((id) => !currentIds.has(id))
    || Array.from(currentIds).some((id) => !selected.has(id));

  const handleSave = () => {
    const toAdd = Array.from(selected).filter((id) => !currentIds.has(id));
    const toRemove = Array.from(currentIds).filter((id) => !selected.has(id));
    onSave(toAdd, toRemove);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={loading ? undefined : onClose} />
      <div className="relative bryzos-card rounded-3xl shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--glass-border)]">
          <h2 className="text-lg font-bold text-surface-900">Manage Members &mdash; {group.name}</h2>
          <button onClick={onClose} disabled={loading} className={closeBtnCls}><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 space-y-5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-surface-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full pl-8 pr-3 rounded-xl border border-surface-300 card-bg text-base text-surface-700 placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="Search devices..." />
          </div>
          <div className="border border-surface-200 rounded-xl max-h-[280px] overflow-y-auto divide-y divide-surface-100">
            {filtered.length === 0 && <div className="py-6 text-center text-base text-surface-400">No devices found</div>}
            {filtered.map((d) => (
              <label key={d.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-surface-50 cursor-pointer">
                <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} className="h-3.5 w-3.5 rounded border-surface-300" />
                <div className="flex-1 min-w-0">
                  <div className="text-base font-medium text-surface-900 truncate">{d.display_name}</div>
                  <div className="text-sm text-surface-400">{d.type}</div>
                </div>
                <StatusDot status={d.status} />
              </label>
            ))}
          </div>
          <div className="text-xs text-surface-400">{selected.size} device(s) selected</div>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--glass-border)]">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button size="sm" onClick={handleSave} loading={loading} disabled={!hasChanges}>Save Members</Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Groups Page
// ---------------------------------------------------------------------------
export function GroupsPage() {
  const activeSiteId = useSiteStore((s) => s.activeSiteId);
  const addToast = useToastStore((s) => s.addToast);
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [editTarget, setEditTarget] = useState<GroupWithCount | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [membersKey, setMembersKey] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<GroupWithCount | null>(null);
  const [bulkAction, setBulkAction] = useState<{ group: GroupWithCount; action: BulkActionType } | null>(null);

  // Queries
  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['groups', activeSiteId],
    queryFn: () => api.get<GroupWithCount[]>(`/groups?site_id=${activeSiteId}`),
    enabled: !!activeSiteId,
  });
  const { data: groupDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['group-detail', selectedGroupId],
    queryFn: () => api.get<GroupDetail>(`/groups/${selectedGroupId}`),
    enabled: !!selectedGroupId,
  });
  const { data: allDevices = [] } = useQuery({
    queryKey: ['devices', activeSiteId],
    queryFn: () => api.get<Device[]>(`/devices?site_id=${activeSiteId}`),
    enabled: !!activeSiteId,
  });

  // Mutations
  const invalidateGroups = () => { qc.invalidateQueries({ queryKey: ['groups'] }); qc.invalidateQueries({ queryKey: ['group-detail'] }); };

  const createGroup = useMutation({
    mutationFn: (d: GroupFormData) => api.post<DeviceGroup>('/groups', { site_id: activeSiteId, name: d.name, description: d.description || null }),
    onSuccess: () => { invalidateGroups(); addToast('success', 'Group created'); closeForm(); },
    onError: (err: Error) => addToast('error', err.message),
  });
  const updateGroup = useMutation({
    mutationFn: ({ id, data }: { id: string; data: GroupFormData }) => api.put<DeviceGroup>(`/groups/${id}`, { name: data.name, description: data.description || null }),
    onSuccess: () => { invalidateGroups(); addToast('success', 'Group updated'); closeForm(); },
    onError: (err: Error) => addToast('error', err.message),
  });
  const deleteGroupMut = useMutation({
    mutationFn: (id: string) => api.delete(`/groups/${id}`),
    onSuccess: () => {
      invalidateGroups();
      addToast('success', 'Group deleted');
      if (confirmDelete && selectedGroupId === confirmDelete.id) setSelectedGroupId(null);
      setConfirmDelete(null);
    },
    onError: (err: Error) => { addToast('error', err.message); setConfirmDelete(null); },
  });
  const addMembersMut = useMutation({
    mutationFn: ({ gid, ids }: { gid: string; ids: string[] }) => api.post(`/groups/${gid}/members`, { device_ids: ids }),
    onSuccess: invalidateGroups,
    onError: (err: Error) => addToast('error', err.message),
  });
  const removeMembersMut = useMutation({
    mutationFn: ({ gid, ids }: { gid: string; ids: string[] }) => api.delete(`/groups/${gid}/members`, { device_ids: ids }),
    onSuccess: invalidateGroups,
    onError: (err: Error) => addToast('error', err.message),
  });
  const groupActionMut = useMutation({
    mutationFn: ({ gid, action }: { gid: string; action: string }) => api.post(`/groups/${gid}/actions`, { action }),
    onSuccess: () => { addToast('success', `${BULK_LABELS[bulkAction?.action ?? 'restart']} sent to group`); setBulkAction(null); },
    onError: (err: Error) => { addToast('error', err.message); setBulkAction(null); },
  });

  // Filter
  const filtered = useMemo(() => {
    if (!search) return groups;
    const q = search.toLowerCase();
    return groups.filter((g) => g.name.toLowerCase().includes(q) || (g.description && g.description.toLowerCase().includes(q)));
  }, [groups, search]);

  // Dialog helpers
  const openCreate = () => { setEditTarget(null); setFormKey((k) => k + 1); setFormOpen(true); };
  const openEdit = (g: GroupWithCount) => { setEditTarget(g); setFormKey((k) => k + 1); setFormOpen(true); };
  const closeForm = () => { setFormOpen(false); setEditTarget(null); };
  const handleFormSubmit = (d: GroupFormData) => { editTarget ? updateGroup.mutate({ id: editTarget.id, data: d }) : createGroup.mutate(d); };
  const openMembers = () => { setMembersKey((k) => k + 1); setMembersOpen(true); };

  const handleMembersSave = async (toAdd: string[], toRemove: string[]) => {
    if (!selectedGroupId) return;
    try {
      if (toRemove.length > 0) await removeMembersMut.mutateAsync({ gid: selectedGroupId, ids: toRemove });
      if (toAdd.length > 0) await addMembersMut.mutateAsync({ gid: selectedGroupId, ids: toAdd });
      addToast('success', 'Members updated');
      setMembersOpen(false);
    } catch { /* mutation onError handles toast */ }
  };

  const handleRemoveMember = useCallback((deviceId: string) => {
    if (!selectedGroupId) return;
    removeMembersMut.mutate({ gid: selectedGroupId, ids: [deviceId] }, { onSuccess: () => addToast('success', 'Device removed from group') });
  }, [selectedGroupId, removeMembersMut, addToast]);

  // No site guard
  if (!activeSiteId) {
    return (
      <div>
        <h1 className="text-3xl font-bold text-surface-900 leading-tight mb-4">Device Groups</h1>
        <EmptyState icon={Users} title="No Site Selected" description="Please select a site from the header to view device groups." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-surface-900 leading-tight">Device Groups</h1>
        <Button size="sm" onClick={openCreate}><Plus className="h-3.5 w-3.5" />New Group</Button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-surface-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full pl-8 pr-3 rounded-xl border border-surface-300 card-bg text-base text-surface-700 placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-primary-500"
            placeholder="Search groups..." />
        </div>
        {search && (
          <button onClick={() => setSearch('')} className="h-10 px-2 inline-flex items-center gap-1 rounded-xl text-base text-surface-500 hover:text-surface-700 hover:bg-surface-100">
            <X className="h-3.5 w-3.5" />Clear
          </button>
        )}
      </div>

      {/* Loading */}
      {isLoading && <div className="flex items-center justify-center py-16"><Spinner size="lg" className="text-surface-400" /></div>}

      {/* Empty */}
      {!isLoading && filtered.length === 0 && (
        <EmptyState icon={Users}
          title={search ? 'No Matching Groups' : 'No Device Groups'}
          description={search ? 'Try adjusting your search.' : 'Create your first device group to organize and control devices together.'}
          action={search ? <button onClick={() => setSearch('')} className="h-10 px-3 rounded-xl border border-surface-300 text-base text-surface-600 hover:bg-surface-50">Clear search</button> : undefined}
        />
      )}

      {/* Table + detail panel */}
      {!isLoading && filtered.length > 0 && (
        <div className="flex gap-4">
          <div className={selectedGroupId ? 'flex-1 min-w-0' : 'w-full'}>
            <div className="bryzos-card rounded-3xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-surface-50 border-b border-[var(--glass-border)]">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">Name</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider hidden md:table-cell">Description</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider w-[90px]">Members</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider hidden lg:table-cell w-[110px]">Created</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-surface-500 uppercase tracking-wider w-[180px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {filtered.map((g) => (
                    <tr key={g.id} onClick={() => setSelectedGroupId(selectedGroupId === g.id ? null : g.id)}
                      className={`hover:bg-surface-50 transition-colors cursor-pointer ${selectedGroupId === g.id ? 'bg-primary-50' : ''}`}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Users className="h-3.5 w-3.5 text-surface-400 shrink-0" />
                          <span className="text-base font-medium text-surface-900 truncate">{g.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-base text-surface-500 truncate max-w-[200px] hidden md:table-cell">{g.description || '--'}</td>
                      <td className="px-3 py-2"><Badge variant="neutral">{g.member_count}</Badge></td>
                      <td className="px-3 py-2 text-base text-surface-400 hidden lg:table-cell">{formatDate(g.created_at)}</td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(g)} title="Edit group" className={iconBtnCls('text-surface-400 hover:text-surface-700 hover:bg-surface-100')}><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setBulkAction({ group: g, action: 'power_on' })} title="Power on all" className={iconBtnCls('text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/5')}><Power className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setBulkAction({ group: g, action: 'power_off' })} title="Power off all" className={iconBtnCls('text-red-400 hover:text-red-600 hover:bg-red-500/5')}><PowerOff className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setBulkAction({ group: g, action: 'restart' })} title="Restart all" className={iconBtnCls('text-amber-500 hover:text-amber-600 hover:bg-amber-500/5')}><RotateCcw className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setConfirmDelete(g)} title="Delete group" className={iconBtnCls('text-red-400 hover:text-red-600 hover:bg-red-500/5')}><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-base text-surface-400">Showing {filtered.length} of {groups.length} group(s)</div>
          </div>

          {/* Detail panel */}
          {selectedGroupId && (
            <div className="w-[360px] shrink-0 bryzos-card rounded-3xl self-start">
              {detailLoading && <div className="flex items-center justify-center py-12"><Spinner className="text-surface-400" /></div>}
              {!detailLoading && groupDetail && (<>
                <div className="px-4 py-3 border-b border-[var(--glass-border)]">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-surface-900 truncate">{groupDetail.name}</h3>
                    <button onClick={() => setSelectedGroupId(null)} className={closeBtnCls}><X className="h-4 w-4" /></button>
                  </div>
                  {groupDetail.description && <p className="text-base text-surface-500 mt-1">{groupDetail.description}</p>}
                </div>
                <div className="px-4 py-2.5 border-b border-[var(--glass-border)] flex items-center justify-between">
                  <span className="text-xs font-medium text-surface-500">Members ({groupDetail.members.length})</span>
                  <button onClick={openMembers} className="h-9 px-2 inline-flex items-center gap-1 rounded-xl text-base text-primary-600 hover:text-primary-700 hover:bg-primary-50 font-medium">
                    <Plus className="h-3.5 w-3.5" />Manage
                  </button>
                </div>
                {groupDetail.members.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-base text-surface-400">No members yet</p>
                    <button onClick={openMembers} className="mt-2 text-base text-primary-600 hover:text-primary-700 font-medium">Add devices</button>
                  </div>
                ) : (
                  <div className="divide-y divide-surface-100 max-h-[400px] overflow-y-auto">
                    {groupDetail.members.map((d) => (
                      <div key={d.id} className="px-4 py-2 flex items-center gap-2 hover:bg-surface-50">
                        <div className="flex-1 min-w-0">
                          <div className="text-base font-medium text-surface-900 truncate">{d.display_name}</div>
                          <div className="text-sm text-surface-400">{d.type}</div>
                        </div>
                        <StatusDot status={d.status} />
                        <button onClick={() => handleRemoveMember(d.id)} title="Remove from group"
                          className="h-6 w-6 inline-flex items-center justify-center rounded text-surface-300 hover:text-red-500 hover:bg-red-500/5">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>)}
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      <GroupFormDialog key={formKey} open={formOpen} editGroup={editTarget}
        loading={createGroup.isPending || updateGroup.isPending} onSubmit={handleFormSubmit} onClose={closeForm} />
      <ManageMembersDialog key={membersKey} open={membersOpen} group={groupDetail || null} allDevices={allDevices}
        loading={addMembersMut.isPending || removeMembersMut.isPending} onSave={handleMembersSave} onClose={() => setMembersOpen(false)} />
      <ConfirmDialog open={confirmDelete !== null} title="Delete Group"
        message={`Are you sure you want to delete "${confirmDelete?.name ?? ''}"? This will not delete the devices, only the group.`}
        confirmLabel="Delete" variant="danger" loading={deleteGroupMut.isPending}
        onConfirm={() => { if (confirmDelete) deleteGroupMut.mutate(confirmDelete.id); }}
        onCancel={() => setConfirmDelete(null)} />
      <ConfirmDialog open={bulkAction !== null}
        title={`${BULK_LABELS[bulkAction?.action ?? 'restart']} Group`}
        message={`Send ${BULK_LABELS[bulkAction?.action ?? 'restart'].toLowerCase()} command to all devices in "${bulkAction?.group.name ?? ''}"?`}
        confirmLabel={BULK_LABELS[bulkAction?.action ?? 'restart']}
        variant={bulkAction?.action === 'power_off' ? 'danger' : 'primary'}
        loading={groupActionMut.isPending}
        onConfirm={() => { if (bulkAction) groupActionMut.mutate({ gid: bulkAction.group.id, action: bulkAction.action }); }}
        onCancel={() => setBulkAction(null)} />
    </div>
  );
}
