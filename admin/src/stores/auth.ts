import { create } from 'zustand';
import type { AuthState, User } from '../lib/types';
import { adminWs } from '../lib/ws';

// Restore session from sessionStorage on load
function loadSession(): { token: string | null; user: User | null } {
  try {
    const raw = sessionStorage.getItem('museumos_auth');
    if (raw) {
      const parsed = JSON.parse(raw);
      return { token: parsed.token || null, user: parsed.user || null };
    }
  } catch {
    // corrupted storage — ignore
  }
  return { token: null, user: null };
}

function saveSession(token: string | null, user: User | null): void {
  if (token && user) {
    sessionStorage.setItem('museumos_auth', JSON.stringify({ token, user }));
  } else {
    sessionStorage.removeItem('museumos_auth');
  }
}

const initial = loadSession();

export const useAuthStore = create<AuthState>((set) => ({
  token: initial.token,
  user: initial.user,
  isAuthenticated: !!initial.token,
  must_change_password: false,

  login: async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const json = await res.json();

    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Login failed');
    }

    const { token, user, must_change_password } = json.data;
    saveSession(token, user);
    set({ token, user, isAuthenticated: true, must_change_password: !!must_change_password });
    adminWs.connect(token);
    startBackgroundRefresh();
  },

  logout: () => {
    stopBackgroundRefresh();
    adminWs.disconnect();
    saveSession(null, null);
    set({ token: null, user: null, isAuthenticated: false, must_change_password: false });
  },

  setToken: (token: string, user: User) => {
    saveSession(token, user);
    set({ token, user, isAuthenticated: true, must_change_password: false });
    adminWs.connect(token);
  },
}));

// Background JWT refresh — every 14 minutes
let refreshInterval: ReturnType<typeof setInterval> | null = null;

function startBackgroundRefresh(): void {
  stopBackgroundRefresh();
  refreshInterval = setInterval(async () => {
    const { token, user } = useAuthStore.getState();
    if (!token || !user) return;
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && json.data.token) {
        useAuthStore.getState().setToken(json.data.token, user);
      }
    } catch {
      // Silently fail — will retry next interval
    }
  }, 14 * 60 * 1000);
}

function stopBackgroundRefresh(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

// Auto-reconnect WebSocket if we restored a session
if (initial.token) {
  adminWs.connect(initial.token);
  startBackgroundRefresh();
}
