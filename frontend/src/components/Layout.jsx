import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import CommandPalette from './CommandPalette';
import { useApi } from '../hooks/useApi';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { data } = useApi('/api/data', 15000);

  // Global keyboard shortcut: Ctrl+K or Cmd+K
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleSidebar = () => {
    setSidebarOpen((prev) => !prev);
    const sidebarEl = document.querySelector('.sidebar');
    if (sidebarEl) {
      sidebarEl.classList.toggle('open');
    }
  };

  return (
    <div className="layout min-h-screen text-[var(--text-primary)] flex flex-col font-sans relative overflow-x-hidden transition-colors duration-300">
      {/* ── Apple Ambient Mesh Gradient Refraction Orbs ── */}
      <div className="fixed top-0 -left-20 w-[550px] h-[550px] bg-sky-500/20 dark:bg-sky-500/25 rounded-full blur-[140px] pointer-events-none z-0" />
      <div className="fixed top-12 -right-20 w-[600px] h-[600px] bg-indigo-500/15 dark:bg-indigo-600/20 rounded-full blur-[160px] pointer-events-none z-0" />
      <div className="fixed -bottom-20 left-1/3 w-[500px] h-[500px] bg-emerald-500/12 dark:bg-emerald-500/15 rounded-full blur-[150px] pointer-events-none z-0" />

      {/* Mobile Drawer */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Topbar Header */}
      <div className="relative z-30">
        <Topbar
          onOpenSearch={() => setSearchOpen(true)}
          onToggleSidebar={toggleSidebar}
        />
      </div>

      {/* Main Content Workspace (Full Width) */}
      <main className="main flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto space-y-6 relative z-10">
        <Outlet context={{ data }} />
      </main>

      {/* Global Command Palette */}
      <CommandPalette isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
