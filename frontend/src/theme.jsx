import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

/**
 * ThemeContext — "Ledger" premium fintech (not AI-purple).
 * Dark default: bg #0A0A0A · layer #000 · card #1A1A1A · border #292929 · text #EDEDED
 * Accent: white-on-dark + blue #0080FF (Geist). Pos #30A46C, Neg #E5484D, Warn #F5A623.
 * Depth via 3-layer bg, NOT shadow. Hairline borders, 4px radius.
 */
const THEMES = {
  dark: {
    '--bg': '#07090e',
    '--bg-base': '#07090e',
    '--layer': 'rgba(18, 20, 29, 0.65)',
    '--card': 'rgba(18, 20, 29, 0.65)',
    '--card-bg': 'rgba(18, 20, 29, 0.65)',
    '--card-border': 'rgba(255, 255, 255, 0.14)',
    '--card-shadow': '0 16px 40px -8px rgba(0, 0, 0, 0.65), 0 4px 12px 0 rgba(0, 0, 0, 0.4)',
    '--card-highlight': 'inset 0 1.5px 1px 0 rgba(255, 255, 255, 0.25), inset 0 -1px 1px 0 rgba(0, 0, 0, 0.4)',
    '--elevated': 'rgba(28, 30, 42, 0.75)',
    '--surface2': 'rgba(255, 255, 255, 0.05)',
    '--border': 'rgba(255, 255, 255, 0.14)',
    '--border-strong': 'rgba(255, 255, 255, 0.25)',
    '--text': 'rgba(255, 255, 255, 0.95)',
    '--text2': 'rgba(235, 235, 245, 0.65)',
    '--text3': 'rgba(235, 235, 245, 0.38)',
    '--text-vibrant-primary': 'rgba(255, 255, 255, 0.95)',
    '--text-vibrant-secondary': 'rgba(235, 235, 245, 0.65)',
    '--text-vibrant-tertiary': 'rgba(235, 235, 245, 0.38)',
    '--text-vibrant-quaternary': 'rgba(235, 235, 245, 0.18)',
    '--accent': '#0a84ff',
    '--accent-hover': '#409cff',
    '--accent-soft': 'rgba(10, 132, 255, 0.15)',
    '--on-accent': '#FFFFFF',
    '--pos': '#34d399',
    '--pos-soft': 'rgba(52, 211, 153, 0.15)',
    '--neg': '#f87171',
    '--neg-soft': 'rgba(248, 113, 113, 0.15)',
    '--warn': '#fbbf24',
    '--warn-soft': 'rgba(251, 191, 36, 0.15)',
    '--btn': '#ffffff',
    '--on-btn': '#07090e',
    '--btn-hover': '#f1f5f9',
    '--selection': 'rgba(10, 132, 255, 0.30)',
    '--mesh-opacity': '0.32',
  },
  light: {
    '--bg': '#f2f2f7',
    '--bg-base': '#f2f2f7',
    '--layer': 'rgba(255, 255, 255, 0.58)',
    '--card': 'linear-gradient(135deg, rgba(255, 255, 255, 0.65) 0%, rgba(255, 255, 255, 0.30) 40%, rgba(255, 255, 255, 0.15) 70%, rgba(255, 255, 255, 0.40) 100%)',
    '--card-bg': 'linear-gradient(135deg, rgba(255, 255, 255, 0.65) 0%, rgba(255, 255, 255, 0.30) 40%, rgba(255, 255, 255, 0.15) 70%, rgba(255, 255, 255, 0.40) 100%)',
    '--card-border': 'rgba(255, 255, 255, 0.45)',
    '--card-shadow': '0 4px 16px -2px rgba(0, 0, 0, 0.06), 0 16px 36px -4px rgba(0, 0, 0, 0.10)',
    '--card-highlight': 'inset 0 1px 1px 0 rgba(255, 255, 255, 0.85), inset 0 -1px 1px 0 rgba(0, 0, 0, 0.04)',
    '--elevated': 'rgba(255, 255, 255, 0.75)',
    '--surface2': 'rgba(255, 255, 255, 0.45)',
    '--border': 'rgba(255, 255, 255, 0.45)',
    '--border-strong': 'rgba(255, 255, 255, 0.95)',
    '--text': 'rgba(0, 0, 0, 0.88)',
    '--text2': 'rgba(60, 60, 67, 0.65)',
    '--text3': 'rgba(60, 60, 67, 0.38)',
    '--text-vibrant-primary': 'rgba(0, 0, 0, 0.88)',
    '--text-vibrant-secondary': 'rgba(60, 60, 67, 0.65)',
    '--text-vibrant-tertiary': 'rgba(60, 60, 67, 0.38)',
    '--text-vibrant-quaternary': 'rgba(60, 60, 67, 0.18)',
    '--accent': '#0071e3',
    '--accent-hover': '#0077ed',
    '--accent-soft': 'rgba(0, 113, 227, 0.12)',
    '--on-accent': '#FFFFFF',
    '--pos': '#059669',
    '--pos-soft': 'rgba(5, 150, 105, 0.12)',
    '--neg': '#dc2626',
    '--neg-soft': 'rgba(220, 38, 38, 0.12)',
    '--warn': '#d97706',
    '--warn-soft': 'rgba(217, 119, 6, 0.12)',
    '--btn': '#090d16',
    '--on-btn': '#FFFFFF',
    '--btn-hover': '#1e293b',
    '--selection': 'rgba(0, 113, 227, 0.20)',
    '--mesh-opacity': '0.18',
  },
};

export const ThemeContext = createContext({ theme: 'dark', toggle: () => {} });
export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark';
    const saved = window.localStorage?.getItem('upstream-theme');
    return (saved === 'dark' || saved === 'light') ? saved : 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    const vars = THEMES[theme];
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
    root.classList.remove('theme-light', 'theme-dark');
    root.classList.add('theme-' + theme);
    document.body.style.backgroundColor = vars['--bg'];
    window.localStorage?.setItem('upstream-theme', theme);
  }, [theme]);

  const toggle = useCallback(() => setTheme(prev => (prev === 'dark' ? 'light' : 'dark')), []);
  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}
