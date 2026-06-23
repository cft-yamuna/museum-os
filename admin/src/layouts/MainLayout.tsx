import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import { useSiteStore } from '../stores/site';
import { useToastStore } from '../stores/toast';
import { useThemeStore } from '../stores/theme';
import { api } from '../lib/api';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Site } from '../lib/types';
import { adminWs } from '../lib/ws';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { BRAND_MONOGRAM, BRAND_NAME, BRAND_TAGLINE } from '../lib/brand';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard,
  Monitor,
  AppWindow,
  FileImage,
  ListMusic,
  Landmark,
  Clock,
  Map,
  Group,
  Power,
  Activity,
  PlayCircle,
  Bell,
  ScrollText,
  Users,
  Settings,
  BookOpen,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  Search,
  ChevronsLeft,
  ChevronsRight,
  Trash2,
  ChevronDown,
  MapPin,
  Footprints,
} from 'lucide-react';
import clsx from 'clsx';

interface NavItem {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  roles?: string[];
  section?: string;
}

const navItems: NavItem[] = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', section: 'Main' },
  { to: '/apps', icon: AppWindow, label: 'Apps', section: 'Main' },
  { to: '/content', icon: FileImage, label: 'Media', section: 'Main' },
  { to: '/playlists', icon: ListMusic, label: 'Playlists', section: 'Main' },
  { to: '/exhibitions', icon: Landmark, label: 'Exhibitions', section: 'Content' },
  { to: '/devices', icon: Monitor, label: 'Devices', section: 'Content' },
  { to: '/schedules', icon: Clock, label: 'Schedules', section: 'Content' },
  { to: '/map', icon: Map, label: 'Floor Map', section: 'Content' },
  { to: '/groups', icon: Group, label: 'Groups', section: 'Content' },
  { to: '/power', icon: Power, label: 'Power & Startup', section: 'System' },
  { to: '/analytics', icon: Activity, label: 'Analytics', section: 'System' },
  { to: '/proof-of-play', icon: PlayCircle, label: 'Proof of Play', roles: ['super_admin', 'site_admin', 'content_manager'], section: 'System' },
  { to: '/engagement', icon: Footprints, label: 'Engagement', roles: ['super_admin', 'site_admin', 'content_manager'], section: 'System' },
  { to: '/alerts', icon: Bell, label: 'Alerts', section: 'System' },
  { to: '/logs', icon: ScrollText, label: 'Logs', section: 'System' },
  { to: '/users', icon: Users, label: 'Users', roles: ['super_admin'], section: 'System' },
  { to: '/recycle-bin', icon: Trash2, label: 'Recycle Bin', section: 'System' },
  { to: '/settings', icon: Settings, label: 'Settings', roles: ['super_admin', 'site_admin'], section: 'System' },
  { to: '/installation-guide', icon: BookOpen, label: 'Setup Guide', roles: ['super_admin', 'site_admin'], section: 'System' },
];

const searchKeywords: Record<string, string[]> = {
  '/': ['dashboard', 'home', 'overview', 'operations'],
  '/apps': ['apps', 'installations', 'templates'],
  '/content': ['media', 'upload', 'images', 'videos', 'files'],
  '/playlists': ['playlists', 'queue'],
  '/exhibitions': ['exhibitions', 'gallery'],
  '/devices': ['devices', 'screens', 'monitors', 'kiosks'],
  '/schedules': ['schedules', 'timing'],
  '/map': ['floor map', 'layout'],
  '/groups': ['groups', 'collections'],
  '/alerts': ['alerts', 'notifications'],
  '/logs': ['logs', 'audit'],
  '/users': ['users', 'team'],
  '/settings': ['settings', 'config'],
  '/installation-guide': ['setup', 'guide', 'docs'],
};

export function MainLayout() {
  const { user, logout } = useAuthStore();
  const { sites, activeSiteId, setSites, setActiveSite } = useSiteStore();
  const addToast = useToastStore((s) => s.addToast);
  const { theme, toggleTheme } = useThemeStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [siteDropOpen, setSiteDropOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const siteDropRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const preSearchPath = useRef<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    api
      .get<Site[]>('/sites')
      .then((s) => {
        setSites(s);
        if (s.length > 0 && !activeSiteId) setActiveSite(s[0].id);
      })
      .catch(() => addToast('error', 'Failed to load sites'));
  }, [activeSiteId, addToast, setActiveSite, setSites]);

  useEffect(() => {
    if (!activeSiteId) return;
    api
      .get<{ high: number; medium: number; low: number; critical: number }>(`/alerts/summary?site_id=${activeSiteId}`)
      .then((s) => setAlertCount(s.high + s.critical))
      .catch(() => {});
  }, [activeSiteId]);

  useEffect(() => {
    const unsubscribe = adminWs.on('alert:created', () => setAlertCount((c) => c + 1));
    return unsubscribe;
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) setSearchOpen(false);
      if (siteDropRef.current && !siteDropRef.current.contains(event.target as Node)) setSiteDropOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
        setSearchOpen(true);
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
        searchInputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const filtered = navItems.filter((item) => !item.roles || (user && item.roles.includes(user.role)));

  const sections = useMemo(() => {
    const map: Record<string, NavItem[]> = {};
    filtered.forEach((item) => {
      const section = item.section || 'Other';
      (map[section] ||= []).push(item);
    });
    return Object.entries(map);
  }, [filtered]);

  const searchResults = useMemo(() => {
    const value = searchQuery.trim().toLowerCase();
    if (!value) return [];
    return filtered.filter(
      (item) =>
        item.label.toLowerCase().includes(value) ||
        (searchKeywords[item.to] || []).some((keyword) => keyword.includes(value))
    );
  }, [filtered, searchQuery]);

  const activeSite = sites.find((site) => site.id === activeSiteId);
  const sideWidth = collapsed ? 'w-[72px]' : 'w-[248px]';
  const mainOffset = collapsed ? 'lg:ml-[72px]' : 'lg:ml-[248px]';

  return (
    <div className="page-bg flex min-h-dvh">
      <aside
        className={clsx(
          'fixed left-0 top-0 z-40 hidden h-dvh flex-col border-r transition-all duration-200 lg:flex',
          sideWidth
        )}
        style={{ background: 'var(--sidebar-bg)', borderColor: 'var(--sidebar-border)' }}
      >
        <SidebarContent
          alertCount={alertCount}
          collapsed={collapsed}
          sections={sections}
          onCollapse={() => setCollapsed((value) => !value)}
          onLogout={handleLogout}
          user={user}
          currentPath={location.pathname}
        />
      </aside>

      <div className={clsx('flex min-h-dvh flex-1 flex-col transition-all duration-200', mainOffset)}>
        <header
          className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-3 lg:px-5"
          style={{ background: 'var(--header-bg)', borderColor: 'var(--header-border)' }}
        >
          <button
            type="button"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="admin-focus flex h-10 w-10 items-center justify-center rounded-md text-surface-600 hover:bg-surface-100 lg:hidden"
            onClick={() => setMobileOpen((value) => !value)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <div className="flex items-center gap-2 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-surface-200 bg-surface-950 text-xs font-bold text-white">
              {BRAND_MONOGRAM}
            </div>
            <span className="text-sm font-semibold text-surface-900">{BRAND_NAME}</span>
          </div>

          <div className="relative hidden flex-1 md:block" ref={searchRef}>
            <div
              className={clsx(
                'flex h-10 max-w-[460px] items-center gap-2 rounded-md border px-3 text-sm transition-colors',
                searchOpen
                  ? 'card-bg border-primary-400 ring-2 ring-primary-500/10'
                  : 'border-surface-200 bg-surface-50 hover:bg-surface-100'
              )}
            >
              <Search className="h-4 w-4 text-surface-400" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => {
                  setSearchOpen(true);
                  if (!preSearchPath.current) preSearchPath.current = location.pathname;
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && searchResults.length > 0) {
                    navigate(searchResults[0].to);
                    setSearchQuery('');
                    setSearchOpen(false);
                    searchInputRef.current?.blur();
                    preSearchPath.current = null;
                  }
                  if (event.key === 'Escape') {
                    if (searchQuery && preSearchPath.current && location.pathname !== preSearchPath.current) {
                      navigate(preSearchPath.current);
                    }
                    setSearchQuery('');
                    setSearchOpen(false);
                    searchInputRef.current?.blur();
                    preSearchPath.current = null;
                  }
                }}
                placeholder="Search navigation"
                className="min-w-0 flex-1 bg-transparent text-sm text-surface-800 placeholder:text-surface-400 focus:outline-none"
              />
              {searchQuery ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchOpen(false);
                    searchInputRef.current?.blur();
                    if (preSearchPath.current && location.pathname !== preSearchPath.current) navigate(preSearchPath.current);
                    preSearchPath.current = null;
                  }}
                  className="admin-focus rounded p-1 text-surface-400 hover:text-surface-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <kbd className="card-bg rounded border border-surface-200 px-1.5 py-0.5 font-data text-[10px] text-surface-400">
                  Ctrl K
                </kbd>
              )}
            </div>

            <AnimatePresence>
              {searchOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.12 }}
                  className="admin-card absolute left-0 top-full z-50 mt-2 w-full max-w-[460px] overflow-hidden"
                >
                  {!searchQuery.trim() ? (
                    <div className="py-2">
                      <div className="px-3 pb-1 text-xs font-semibold uppercase text-surface-400">Quick links</div>
                      {[
                        { icon: Monitor, label: 'Devices', desc: 'Screens and kiosks', to: '/devices' },
                        { icon: FileImage, label: 'Media', desc: 'Files and uploads', to: '/content' },
                        { icon: AppWindow, label: 'Apps', desc: 'Template configurations', to: '/apps' },
                        { icon: Bell, label: 'Alerts', desc: 'Operational issues', to: '/alerts' },
                      ].map((item) => (
                        <SearchOption key={item.to} {...item} onSelect={() => navigate(item.to)} />
                      ))}
                    </div>
                  ) : searchResults.length > 0 ? (
                    <div className="py-2">
                      {searchResults.map((item) => (
                        <SearchOption
                          key={item.to}
                          icon={item.icon}
                          label={item.label}
                          desc={item.section || 'Navigation'}
                          active={location.pathname === item.to}
                          onSelect={() => {
                            navigate(item.to);
                            setSearchQuery('');
                            setSearchOpen(false);
                          }}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="px-4 py-8 text-center text-sm text-surface-500">No navigation results found.</div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {sites.length > 0 && (
            <div className="relative ml-auto" ref={siteDropRef}>
              <button
                type="button"
                aria-expanded={siteDropOpen}
                aria-label="Select active site"
                onClick={() => setSiteDropOpen((value) => !value)}
                className={clsx(
                  'admin-focus flex h-10 max-w-[220px] items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors',
                  siteDropOpen
                    ? 'card-bg border-primary-400 text-surface-900'
                    : 'border-surface-200 bg-surface-50 text-surface-700 hover:bg-surface-100'
                )}
              >
                <MapPin className="h-4 w-4 shrink-0 text-surface-400" />
                <span className="truncate">{activeSite?.name || 'Select site'}</span>
                <ChevronDown className={clsx('h-4 w-4 text-surface-400 transition-transform', siteDropOpen && 'rotate-180')} />
              </button>

              <AnimatePresence>
                {siteDropOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.12 }}
                    className="admin-card absolute right-0 top-full z-50 mt-2 min-w-[220px] overflow-hidden"
                  >
                    <div className="border-b border-surface-200 px-3 py-2 text-xs font-semibold uppercase text-surface-400">
                      Sites
                    </div>
                    <div className="max-h-[260px] overflow-y-auto py-1">
                      {sites.map((site) => (
                        <button
                          key={site.id}
                          type="button"
                          onClick={() => {
                            setActiveSite(site.id);
                            setSiteDropOpen(false);
                          }}
                          className={clsx(
                            'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                            site.id === activeSiteId
                              ? 'bg-primary-50 font-semibold text-primary-700 dark:bg-primary-500/10 dark:text-primary-300'
                              : 'text-surface-700 hover:bg-surface-50'
                          )}
                        >
                          <MapPin className="h-4 w-4 shrink-0" />
                          <span className="truncate">{site.name}</span>
                          {site.id === activeSiteId && <span className="ml-auto text-xs text-primary-600">Active</span>}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={toggleTheme}
              className="admin-focus flex h-10 w-10 items-center justify-center rounded-md text-surface-500 hover:bg-surface-100 hover:text-surface-900"
            >
              {theme === 'dark' ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
            </button>
            <button
              type="button"
              aria-label="Open alerts"
              onClick={() => navigate('/alerts')}
              className="admin-focus relative flex h-10 w-10 items-center justify-center rounded-md text-surface-500 hover:bg-surface-100 hover:text-surface-900"
            >
              <Bell className="h-4.5 w-4.5" />
              {alertCount > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-600 ring-2 ring-white" />}
            </button>
            <div className="hidden h-6 w-px bg-surface-200 sm:block" />
            <div className="hidden items-center gap-2 pl-2 sm:flex">
              <div className="text-right">
                <div className="text-sm font-semibold leading-tight text-surface-900">{user?.name || 'User'}</div>
                <div className="text-xs capitalize leading-tight text-surface-500">{user?.role?.replace('_', ' ') || ''}</div>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-900 text-sm font-semibold text-white">
                {user?.name?.charAt(0)?.toUpperCase() || '?'}
              </div>
            </div>
            <button
              type="button"
              aria-label="Log out"
              onClick={handleLogout}
              className="admin-focus flex h-10 w-10 items-center justify-center rounded-md text-surface-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-500/10"
            >
              <LogOut className="h-4.5 w-4.5" />
            </button>
          </div>
        </header>

        <AnimatePresence>
          {mobileOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 bg-black/50 lg:hidden"
                onClick={() => setMobileOpen(false)}
              />
              <motion.div
                initial={{ x: -276 }}
                animate={{ x: 0 }}
                exit={{ x: -276 }}
                transition={{ duration: 0.18 }}
                className="fixed bottom-0 left-0 top-0 z-50 w-[276px] overflow-y-auto border-r lg:hidden"
                style={{ background: 'var(--sidebar-bg)', borderColor: 'var(--sidebar-border)' }}
              >
                <SidebarContent
                  alertCount={alertCount}
                  collapsed={false}
                  sections={sections}
                  onCollapse={() => {}}
                  onLogout={handleLogout}
                  onNavigate={() => setMobileOpen(false)}
                  user={user}
                  currentPath={location.pathname}
                  mobile
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <main className="flex-1 px-4 py-5 sm:px-5 lg:px-6 lg:py-6">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16 }}
          >
            <ErrorBoundary variant="route" resetKey={location.pathname}>
              <Outlet />
            </ErrorBoundary>
          </motion.div>
        </main>
      </div>
    </div>
  );
}

function SidebarContent({
  alertCount,
  collapsed,
  currentPath,
  mobile,
  onCollapse,
  onLogout,
  onNavigate,
  sections,
  user,
}: {
  alertCount: number;
  collapsed: boolean;
  currentPath: string;
  mobile?: boolean;
  onCollapse: () => void;
  onLogout: () => void;
  onNavigate?: () => void;
  sections: [string, NavItem[]][];
  user: ReturnType<typeof useAuthStore.getState>['user'];
}) {
  const activeRail = 'absolute left-0 top-2 bottom-2 w-1 rounded-r bg-primary-500';

  return (
    <>
      <div className={clsx('flex h-14 shrink-0 items-center border-b px-3', collapsed ? 'justify-center' : 'gap-3')} style={{ borderColor: 'var(--sidebar-border)' }}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white text-xs font-bold text-surface-950">
          {BRAND_MONOGRAM}
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">{BRAND_NAME}</div>
            <div className="truncate text-xs" style={{ color: 'var(--sidebar-muted)' }}>
              {BRAND_TAGLINE}
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {sections.map(([section, items], index) => (
          <div key={section}>
            {!collapsed && (
              <div className={clsx('px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide', index > 0 && 'pt-4')} style={{ color: 'var(--sidebar-muted)' }}>
                {section}
              </div>
            )}
            {collapsed && index > 0 && <div className="mx-2 my-3 border-t border-white/10" />}
            {items.map((item) => {
              const active = item.to === '/' ? currentPath === '/' : currentPath.startsWith(item.to);
              return (
                <NavLink key={item.to} to={item.to} title={collapsed ? item.label : undefined} onClick={onNavigate}>
                  <div
                    className={clsx(
                      'relative mb-1 flex h-10 items-center gap-3 rounded-md text-sm transition-colors',
                      collapsed ? 'mx-auto w-10 justify-center' : 'px-3',
                      active
                        ? 'bg-white/10 font-semibold text-white'
                        : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
                    )}
                  >
                    {active && <span className={activeRail} />}
                    <item.icon className="h-[18px] w-[18px] shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {item.to === '/alerts' && alertCount > 0 && (
                      <span
                        className={clsx(
                          'flex items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white',
                          collapsed ? 'absolute right-0 top-0 h-4 min-w-4 px-1' : 'ml-auto h-5 min-w-5 px-1'
                        )}
                      >
                        {alertCount > 9 ? '9+' : alertCount}
                      </span>
                    )}
                  </div>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t p-2" style={{ borderColor: 'var(--sidebar-border)' }}>
        {!mobile && (
          <button
            type="button"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={onCollapse}
            className={clsx(
              'mb-2 flex h-9 w-full items-center gap-3 rounded-md text-sm text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white',
              collapsed ? 'justify-center' : 'px-3'
            )}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            {!collapsed && <span>Collapse</span>}
          </button>
        )}

        {!collapsed && (
          <div className="rounded-md border border-white/10 bg-white/[0.04] p-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-sm font-semibold text-surface-950">
                {user?.name?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-white/90">{user?.name || 'User'}</div>
                <div className="truncate text-xs text-white/40">{user?.email || ''}</div>
              </div>
              <button
                type="button"
                aria-label="Log out"
                onClick={onLogout}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/45 hover:bg-white/[0.06] hover:text-red-300"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 border-t border-white/10 pt-2 font-data text-[10px] text-white/28">
              v{__APP_VERSION__} ({__GIT_HASH__})
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function SearchOption({
  active,
  desc,
  icon: Icon,
  label,
  onSelect,
}: {
  active?: boolean;
  desc: string;
  icon: typeof LayoutDashboard;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-50"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-md border border-surface-200 bg-surface-50 text-surface-500">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-surface-800">{label}</span>
        <span className="block truncate text-xs text-surface-500">{desc}</span>
      </span>
      {active && <span className="text-xs font-semibold text-primary-700">Current</span>}
    </button>
  );
}
