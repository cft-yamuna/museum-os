import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  UserPlus,
  Pencil,
  Trash2,
  ShieldAlert,
  X,
  Users,
  Power,
  Info,
} from 'lucide-react';
import clsx from 'clsx';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useToastStore } from '../stores/toast';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import type { User, Site } from '../lib/types';

// ---------------------------------------------------------------------------
// Role configuration
// ---------------------------------------------------------------------------

type UserRole = User['role'];

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  site_admin: 'Site Admin',
  content_manager: 'Content Manager',
  operator: 'Operator',
};

const ROLE_BADGE_VARIANT: Record<UserRole, 'danger' | 'warning' | 'info' | 'neutral'> = {
  super_admin: 'danger',
  site_admin: 'warning',
  content_manager: 'info',
  operator: 'neutral',
};

const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  super_admin: 'Full system access, user management',
  site_admin: 'Full access within assigned sites',
  content_manager: 'Content upload, scheduling, monitoring',
  operator: 'View-only, can acknowledge alerts',
};

const ALL_ROLES: UserRole[] = ['super_admin', 'site_admin', 'content_manager', 'operator'];

// ---------------------------------------------------------------------------
// Avatar initial helper
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// ---------------------------------------------------------------------------
// Confirm Dialog
// ---------------------------------------------------------------------------

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  variant?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  variant = 'danger',
  loading,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={loading ? undefined : onCancel} />
      <div className="relative bryzos-card rounded-3xl shadow-xl w-full max-w-sm mx-4">
        <div className="p-4 space-y-3">
          <h2 className="text-lg font-bold text-surface-900">{title}</h2>
          <p className="text-base text-surface-600">{message}</p>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--glass-border)]">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant={variant} size="sm" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// User Form Dialog (Create / Edit)
// ---------------------------------------------------------------------------

interface UserFormData {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  site_ids: string[];
}

const EMPTY_FORM: UserFormData = {
  name: '',
  email: '',
  password: '',
  role: 'operator',
  site_ids: [],
};

interface UserFormDialogProps {
  open: boolean;
  editUser: User | null;
  sites: Site[];
  loading: boolean;
  onSubmit: (data: UserFormData) => void;
  onClose: () => void;
}

function UserFormDialog({ open, editUser, sites, loading, onSubmit, onClose }: UserFormDialogProps) {
  // The parent remounts this dialog on every open via a changing `key`
  // (see `formKey` in openCreate/openEdit), so the form state is seeded once
  // from `editUser` in the initializer below — no render-time side effects or
  // effects needed.
  const [form, setForm] = useState<UserFormData>(() =>
    editUser
      ? {
          name: editUser.name,
          email: editUser.email,
          password: '',
          role: editUser.role,
          site_ids: editUser.site_ids ? [...editUser.site_ids] : [],
        }
      : { ...EMPTY_FORM }
  );
  const [errors, setErrors] = useState<Partial<Record<keyof UserFormData, string>>>({});

  const updateField = <K extends keyof UserFormData>(key: K, value: UserFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const toggleSite = (siteId: string) => {
    setForm((prev) => {
      const has = prev.site_ids.includes(siteId);
      return {
        ...prev,
        site_ids: has
          ? prev.site_ids.filter((id) => id !== siteId)
          : [...prev.site_ids, siteId],
      };
    });
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof UserFormData, string>> = {};
    if (!form.name.trim()) next.name = 'Name is required';
    if (!form.email.trim()) next.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'Invalid email';
    if (!editUser && !form.password) next.password = 'Password is required';
    if (form.password && form.password.length < 8) next.password = 'Min 8 characters';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onSubmit(form);
  };

  if (!open) return null;

  const showSites = form.role !== 'super_admin';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={loading ? undefined : onClose} />
      <div className="relative bryzos-card rounded-3xl shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--glass-border)]">
          <h2 className="text-lg font-bold text-surface-900">
            {editUser ? 'Edit User' : 'New User'}
          </h2>
          <button
            onClick={onClose}
            disabled={loading}
            className="h-7 w-7 inline-flex items-center justify-center rounded-xl text-surface-400 hover:text-surface-600 hover:bg-surface-100 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {/* Name */}
          <div>
            <label className="block text-sm font-semibold text-surface-600 mb-1.5">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              className={clsx(
                'h-10 w-full px-3 rounded-xl border text-base text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500',
                errors.name ? 'border-red-400' : 'border-surface-300'
              )}
              placeholder="Full name"
            />
            {errors.name && (
              <p className="text-sm text-red-500 mt-0.5">{errors.name}</p>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-semibold text-surface-600 mb-1.5">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => updateField('email', e.target.value)}
              className={clsx(
                'h-10 w-full px-3 rounded-xl border text-base text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500',
                errors.email ? 'border-red-400' : 'border-surface-300'
              )}
              placeholder="user@example.com"
            />
            {errors.email && (
              <p className="text-sm text-red-500 mt-0.5">{errors.email}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-semibold text-surface-600 mb-1.5">
              Password {!editUser && <span className="text-red-500">*</span>}
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => updateField('password', e.target.value)}
              className={clsx(
                'h-10 w-full px-3 rounded-xl border text-base text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500',
                errors.password ? 'border-red-400' : 'border-surface-300'
              )}
              placeholder={editUser ? 'Leave blank to keep unchanged' : 'Min 8 characters'}
            />
            {errors.password && (
              <p className="text-sm text-red-500 mt-0.5">{errors.password}</p>
            )}
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-semibold text-surface-600 mb-1.5">Role</label>
            <select
              value={form.role}
              onChange={(e) => updateField('role', e.target.value as UserRole)}
              className="h-10 w-full px-2 rounded-xl border border-surface-300 card-bg text-base text-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {ALL_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <p className="text-sm text-surface-400 mt-0.5 flex items-center gap-1">
              <Info className="h-3 w-3 shrink-0" />
              {ROLE_DESCRIPTIONS[form.role]}
            </p>
          </div>

          {/* Sites (only for non-super_admin) */}
          {showSites && (
            <div>
              <label className="block text-sm font-semibold text-surface-600 mb-1.5">
                Sites
              </label>
              {sites.length === 0 ? (
                <p className="text-sm text-surface-400">No sites available</p>
              ) : (
                <div className="border border-surface-200 rounded-xl max-h-[120px] overflow-y-auto divide-y divide-surface-100">
                  {sites.map((site) => (
                    <label
                      key={site.id}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={form.site_ids.includes(site.id)}
                        onChange={() => toggleSite(site.id)}
                        className="h-3.5 w-3.5 rounded border-surface-300"
                      />
                      <span className="text-base text-surface-700">{site.name}</span>
                      <span className="text-sm text-surface-400 ml-auto">{site.code}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={loading} type="button">
              Cancel
            </Button>
            <Button size="sm" type="submit" loading={loading}>
              {editUser ? 'Save Changes' : 'Create User'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Users Page
// ---------------------------------------------------------------------------

export function UsersPage() {
  const currentUser = useAuthStore((s) => s.user);
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();

  // Local state
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [editTarget, setEditTarget] = useState<User | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<User | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<User | null>(null);

  // Access is gated by `isSuperAdmin` below. All hooks must run unconditionally
  // first (rules of hooks), so the access-denied guard renders after them and
  // the data queries stay disabled for non-admins.
  const isSuperAdmin = currentUser?.role === 'super_admin';

  // ---- Queries ----
  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<User[]>('/users'),
    enabled: isSuperAdmin,
  });

  const { data: sites = [] } = useQuery({
    queryKey: ['sites'],
    queryFn: () => api.get<Site[]>('/sites'),
    enabled: isSuperAdmin,
  });

  // ---- Mutations ----
  const createUser = useMutation({
    mutationFn: (data: UserFormData) => {
      const body: Record<string, unknown> = {
        name: data.name,
        email: data.email,
        password: data.password,
        role: data.role,
        site_ids: data.role === 'super_admin' ? [] : data.site_ids,
      };
      return api.post<User>('/users', body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      addToast('success', 'User created successfully');
      closeForm();
    },
    onError: (err: Error) => {
      addToast('error', err.message);
    },
  });

  const updateUser = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<UserFormData> & { is_active?: boolean } }) => {
      const body: Record<string, unknown> = { ...data };
      if (data.password === '') {
        delete body.password;
      }
      if (data.role === 'super_admin') {
        body.site_ids = [];
      }
      return api.put<User>(`/users/${id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: Error) => {
      addToast('error', err.message);
    },
  });

  const deleteUser = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      addToast('success', 'User deleted');
      setConfirmDelete(null);
    },
    onError: (err: Error) => {
      addToast('error', err.message);
      setConfirmDelete(null);
    },
  });

  // ---- Filtering ----
  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (search) {
        const q = search.toLowerCase();
        if (!u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
      }
      if (roleFilter && u.role !== roleFilter) return false;
      if (statusFilter === 'active' && !u.is_active) return false;
      if (statusFilter === 'inactive' && u.is_active) return false;
      return true;
    });
  }, [users, search, roleFilter, statusFilter]);

  const hasActiveFilters = search || roleFilter || statusFilter;

  const clearFilters = () => {
    setSearch('');
    setRoleFilter('');
    setStatusFilter('');
  };

  // ---- Dialog helpers ----
  const openCreate = () => {
    setEditTarget(null);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  };

  const openEdit = (user: User) => {
    setEditTarget(user);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditTarget(null);
  };

  const handleFormSubmit = (data: UserFormData) => {
    if (editTarget) {
      updateUser.mutate(
        { id: editTarget.id, data },
        {
          onSuccess: () => {
            addToast('success', 'User updated');
            closeForm();
          },
        }
      );
    } else {
      createUser.mutate(data);
    }
  };

  const handleToggleActive = () => {
    if (!confirmToggle) return;
    const nextActive = !confirmToggle.is_active;
    updateUser.mutate(
      { id: confirmToggle.id, data: { is_active: nextActive } },
      {
        onSuccess: () => {
          addToast('success', nextActive ? 'User activated' : 'User deactivated');
          setConfirmToggle(null);
        },
        onError: () => {
          setConfirmToggle(null);
        },
      }
    );
  };

  // ---- Site name lookup ----
  const siteMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sites) {
      map.set(s.id, s.name);
    }
    return map;
  }, [sites]);

  const getSiteNames = (siteIds: string[] | null): string => {
    if (!siteIds || siteIds.length === 0) return '--';
    return siteIds
      .map((id) => siteMap.get(id) || id)
      .join(', ');
  };

  // ---- Access guard (after all hooks; rules of hooks) ----
  if (!isSuperAdmin) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Access Denied"
        description="Only Super Admins can manage users."
      />
    );
  }

  // ---- Render ----
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-surface-900 leading-tight">Users</h1>
        <Button size="sm" onClick={openCreate}>
          <UserPlus className="h-3.5 w-3.5" />
          New User
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-surface-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full pl-8 pr-3 rounded-xl border border-surface-300 card-bg text-base text-surface-700 placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-primary-500"
            placeholder="Search by name or email..."
          />
        </div>

        {/* Role filter */}
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="h-10 w-[140px] px-2 rounded-xl border border-surface-300 card-bg text-base text-surface-600 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          <option value="">Role</option>
          {ALL_ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 w-[120px] px-2 rounded-xl border border-surface-300 card-bg text-base text-surface-600 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          <option value="">Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        {/* Clear */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="h-10 px-2 inline-flex items-center gap-1 rounded-xl text-base text-surface-500 hover:text-surface-700 hover:bg-surface-100"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Loading */}
      {usersLoading && (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" className="text-surface-400" />
        </div>
      )}

      {/* Empty */}
      {!usersLoading && filtered.length === 0 && (
        <EmptyState
          icon={Users}
          title={hasActiveFilters ? 'No Matching Users' : 'No Users'}
          description={
            hasActiveFilters
              ? 'Try adjusting your search or filters.'
              : 'Create your first user to get started.'
          }
          action={
            hasActiveFilters ? (
              <button
                onClick={clearFilters}
                className="h-10 px-3 rounded-xl border border-surface-300 text-base text-surface-600 hover:bg-surface-50"
              >
                Clear filters
              </button>
            ) : undefined
          }
        />
      )}

      {/* Table */}
      {!usersLoading && filtered.length > 0 && (
        <div className="bryzos-card rounded-3xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-surface-50 border-b border-[var(--glass-border)]">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider hidden lg:table-cell">
                  Sites
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500 uppercase tracking-wider w-[80px]">
                  Status
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-surface-500 uppercase tracking-wider w-[140px]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {filtered.map((user) => (
                <tr key={user.id} className="hover:bg-surface-50 transition-colors">
                  {/* Name with avatar initial */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-surface-200 flex items-center justify-center shrink-0">
                        <span className="text-sm font-medium text-surface-600">
                          {getInitials(user.name)}
                        </span>
                      </div>
                      <span className="text-base font-medium text-surface-900 truncate max-w-[160px]">
                        {user.name}
                      </span>
                    </div>
                  </td>

                  {/* Email */}
                  <td className="px-3 py-2 text-base text-surface-600 truncate max-w-[180px]">
                    {user.email}
                  </td>

                  {/* Role badge */}
                  <td className="px-3 py-2">
                    <Badge variant={ROLE_BADGE_VARIANT[user.role]}>
                      {ROLE_LABELS[user.role]}
                    </Badge>
                  </td>

                  {/* Sites */}
                  <td className="px-3 py-2 text-base text-surface-500 hidden lg:table-cell truncate max-w-[200px]">
                    {user.role === 'super_admin' ? (
                      <span className="text-surface-400 italic">All sites</span>
                    ) : (
                      getSiteNames(user.site_ids)
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-3 py-2">
                    <span
                      className={clsx(
                        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-sm font-medium',
                        user.is_active
                          ? 'bg-emerald-500/10 text-emerald-500'
                          : 'bg-surface-100 text-surface-500'
                      )}
                    >
                      <span
                        className={clsx(
                          'h-1.5 w-1.5 rounded-full',
                          user.is_active ? 'bg-emerald-500' : 'bg-surface-400'
                        )}
                      />
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {/* Edit */}
                      <button
                        onClick={() => openEdit(user)}
                        title="Edit user"
                        className="h-7 w-7 inline-flex items-center justify-center rounded-xl text-surface-400 hover:text-surface-700 hover:bg-surface-100"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>

                      {/* Toggle active */}
                      <button
                        onClick={() => {
                          if (user.is_active) {
                            setConfirmToggle(user);
                          } else {
                            updateUser.mutate(
                              { id: user.id, data: { is_active: true } },
                              {
                                onSuccess: () => addToast('success', 'User activated'),
                              }
                            );
                          }
                        }}
                        title={user.is_active ? 'Deactivate user' : 'Activate user'}
                        className={clsx(
                          'h-7 w-7 inline-flex items-center justify-center rounded-xl',
                          user.is_active
                            ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-500/5'
                            : 'text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/5'
                        )}
                      >
                        <Power className="h-3.5 w-3.5" />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => setConfirmDelete(user)}
                        title="Delete user"
                        className="h-7 w-7 inline-flex items-center justify-center rounded-xl text-red-400 hover:text-red-600 hover:bg-red-500/5"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer count */}
      {!usersLoading && filtered.length > 0 && (
        <div className="text-base text-surface-400">
          Showing {filtered.length} of {users.length} user(s)
        </div>
      )}

      {/* Create / Edit dialog */}
      <UserFormDialog
        key={formKey}
        open={formOpen}
        editUser={editTarget}
        sites={sites}
        loading={createUser.isPending || updateUser.isPending}
        onSubmit={handleFormSubmit}
        onClose={closeForm}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete User"
        message={`Are you sure you want to delete "${confirmDelete?.name ?? ''}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleteUser.isPending}
        onConfirm={() => {
          if (confirmDelete) deleteUser.mutate(confirmDelete.id);
        }}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* Deactivate confirmation */}
      <ConfirmDialog
        open={confirmToggle !== null}
        title="Deactivate User"
        message={`Are you sure you want to deactivate "${confirmToggle?.name ?? ''}"? They will no longer be able to log in.`}
        confirmLabel="Deactivate"
        variant="danger"
        loading={updateUser.isPending}
        onConfirm={handleToggleActive}
        onCancel={() => setConfirmToggle(null)}
      />
    </div>
  );
}
