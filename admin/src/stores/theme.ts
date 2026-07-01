import { create } from 'zustand';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'curato_theme';

/** Read the saved theme, defaulting to the rich dark theme. */
export function getInitialTheme(): Theme {
  return (localStorage.getItem(STORAGE_KEY) as Theme) || 'dark';
}

/** Apply the theme class to <html>. Call once before first render. */
export function initTheme(): void {
  document.documentElement.classList.toggle('dark', getInitialTheme() === 'dark');
}

interface ThemeStore {
  theme: Theme;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: getInitialTheme(),
  toggleTheme: () =>
    set((s) => {
      const next: Theme = s.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.classList.toggle('dark', next === 'dark');
      return { theme: next };
    }),
}));
