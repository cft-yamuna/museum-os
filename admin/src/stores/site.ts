import { create } from 'zustand';
import type { SiteState } from '../lib/types';

// Restore active site from sessionStorage
function loadActiveSite(): string | null {
  try {
    return sessionStorage.getItem('museumos_active_site') || null;
  } catch {
    return null;
  }
}

export const useSiteStore = create<SiteState>((set) => ({
  sites: [],
  activeSiteId: loadActiveSite(),

  setSites: (sites) => {
    set({ sites });
    // Auto-select first site if none selected
    const current = useSiteStore.getState().activeSiteId;
    if (!current && sites.length > 0) {
      const siteId = sites[0].id;
      sessionStorage.setItem('museumos_active_site', siteId);
      set({ activeSiteId: siteId });
    }
  },

  setActiveSite: (id) => {
    sessionStorage.setItem('museumos_active_site', id);
    set({ activeSiteId: id });
  },
}));
