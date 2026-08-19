import { createContext, useContext, useState, useCallback, useEffect } from 'react';

/**
 * ThemeContext — "Ledger" premium fintech (not AI-purple).
 * Dark default: bg #0A0A0A · layer #000 · card #1A1A1A · border #292929 · text #EDEDED
 * Accent: white-on-dark + blue #0080FF (Geist). Pos #30A46C, Neg #E5484D, Warn #F5A623.
 * Depth via 3-layer bg, NOT shadow. Hairline borders, 4px radius.
 */
const THEMES = {
  dark: {
    '--bg': '#0A0A0A',
    '--layer': '#000000',
    '--card': '#1A1A1A',
    '--elevated': '#1F1F1F',
    '--surface2': '#161616',
    '--border': '#292929',
    '--border-strong': '#3A3A3A',
    '--text': '#EDEDED',
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
    '--bg': '#FFFFFF',
    '--layer': '#FAFAFA',
    '--card': '#FFFFFF',
    '--elevated': '#F2F2F2',
    '--surface2': '#F4F4F4',
    '--border': '#EBEBEB',
    '--border-strong': '#D4D4D4',
    '--text': '#171717',
    '--text2': '#4D4D4D',
    '--text3': '#8F8F8F',
    '--accent': '#0091FF',
    '--accent-hover': '#0072F5',
    '--accent-soft': 'rgba(0,145,255,0.08)',
    '--on-accent': '#FFFFFF',
    '--pos': '#18794E',
    '--pos-soft': 'rgba(24,121,78,0.10)',
    '--neg': '#CD2B31',
    '--neg-soft': 'rgba(205,43,49,0.10)',
    '--warn': '#B76E00',
    '--warn-soft': 'rgba(183,110,0,0.10)',
    '--btn': '#0A0A0A',         // dark button fill on light
    '--on-btn': '#FFFFFF',
    '--btn-hover': '#1A1A1A',
    '--selection': 'rgba(0,145,255,0.2)',
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
