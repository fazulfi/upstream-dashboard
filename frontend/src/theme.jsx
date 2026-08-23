import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

/**
 * ThemeContext — "Ledger" premium fintech (not AI-purple).
 * Dark default: bg #0A0A0A · layer #000 · card #1A1A1A · border #292929 · text #EDEDED
 * Accent: white-on-dark + blue #0080FF (Geist). Pos #30A46C, Neg #E5484D, Warn #F5A623.
 * Depth via 3-layer bg, NOT shadow. Hairline borders, 4px radius.
 */
const THEMES = {
  dark: {
    '--bg': '#0A0A0A',
    '--layer': 'rgba(20, 20, 25, 0.45)',
    '--card': 'rgba(30, 30, 30, 0.45)',
    '--elevated': 'rgba(35, 35, 40, 0.60)',
    '--surface2': 'rgba(255, 255, 255, 0.04)',
    '--border': '#292929',
    '--border-strong': '#3A3A3A',
    '--text': '#ffffff',
    '--text2': '#A1A1A1',
    '--text3': '#6F6F6F',
    '--accent': '#0080FF',
    '--accent-hover': '#4DA3FF',
    '--accent-soft': 'rgba(0,128,255,0.10)',
    '--on-accent': '#FFFFFF',
    '--pos': '#30A46C',
    '--pos-soft': 'rgba(48,164,108,0.12)',
    '--neg': '#E5484D',
    '--neg-soft': 'rgba(229,72,77,0.12)',
    '--warn': '#F5A623',
    '--warn-soft': 'rgba(245,166,35,0.12)',
    '--btn': '#EDEDED',         // white button fill
    '--on-btn': '#0A0A0A',      // text on white button
    '--btn-hover': '#FFFFFF',
    '--selection': 'rgba(0,128,255,0.25)',
  },
  light: {
    '--bg': '#eef2f7',
    '--layer': 'rgba(255, 255, 255, 0.15)',
    '--card': 'rgba(255, 255, 255, 0.15)',
    '--elevated': 'rgba(255, 255, 255, 0.25)',
    '--surface2': 'rgba(0, 0, 0, 0.03)',
    '--border': 'rgba(15, 23, 42, 0.14)',
    '--border-strong': 'rgba(15, 23, 42, 0.24)',
    '--text': '#1c1c1e',
    '--text2': '#334155',
    '--text3': '#52525b',
    '--accent': '#0071e3',
    '--accent-hover': '#0077ed',
    '--accent-soft': 'rgba(0, 113, 227, 0.10)',
    '--on-accent': '#FFFFFF',
    '--pos': '#15803d',
    '--pos-soft': 'rgba(21, 128, 61, 0.10)',
    '--neg': '#b91c1c',
    '--neg-soft': 'rgba(185, 28, 28, 0.10)',
    '--warn': '#b45309',
    '--warn-soft': 'rgba(180, 83, 9, 0.10)',
    '--btn': '#1c1c1e',         // dark button fill on light
    '--on-btn': '#FFFFFF',
    '--btn-hover': '#1e293b',
    '--selection': 'rgba(0, 113, 227, 0.20)',
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
    document.body.style.background = vars['--bg'];
    window.localStorage?.setItem('upstream-theme', theme);
  }, [theme]);

  const toggle = useCallback(() => setTheme(prev => (prev === 'dark' ? 'light' : 'dark')), []);
  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}
