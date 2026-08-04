import { writable } from 'svelte/store';

const STORAGE_KEY = 'pinggo-theme';

function getSystemPreference() {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function getStoredTheme() {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
}

export const currentTheme = writable('dark');

export function initTheme() {
  const stored = getStoredTheme();
  const theme = stored || getSystemPreference();
  currentTheme.set(theme);
  applyTheme(theme);

  if (typeof window !== 'undefined') {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
      const storedNow = getStoredTheme();
      if (!storedNow) {
        const newTheme = e.matches ? 'light' : 'dark';
        currentTheme.set(newTheme);
        applyTheme(newTheme);
      }
    });
  }
}

export function toggleTheme() {
  currentTheme.update((t) => {
    const next = t === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
    return next;
  });
}
