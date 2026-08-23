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
    <div className="layout min-h-screen text-[var(--text-body)] flex flex-col font-sans relative overflow-x-hidden transition-colors duration-300">
      {/* ── Apple iOS 26 Spatial Ambient Mesh Gradient Refraction Wallpaper ── */}
      <div
        className="fixed -top-16 -left-16 w-[700px] h-[700px] rounded-full blur-[130px] pointer-events-none z-0 transition-opacity duration-500"
        style={{
          background: 'radial-gradient(circle, #38bdf8 0%, #0284c7 60%, transparent 80%)',
          opacity: 'var(--mesh-opacity, 0.40)',
        }}
      />
      <div
        className="fixed top-8 -right-16 w-[750px] h-[750px] rounded-full blur-[140px] pointer-events-none z-0 transition-opacity duration-500"
        style={{
          background: 'radial-gradient(circle, #a855f7 0%, #6366f1 60%, transparent 80%)',
          opacity: 'var(--mesh-opacity, 0.35)',
        }}
      />
      <div
        className="fixed -bottom-16 left-1/4 w-[650px] h-[650px] rounded-full blur-[130px] pointer-events-none z-0 transition-opacity duration-500"
        style={{
          background: 'radial-gradient(circle, #34d399 0%, #059669 60%, transparent 80%)',
          opacity: 'var(--mesh-opacity, 0.30)',
        }}
      />
      <div
        className="fixed top-1/2 right-1/4 w-[550px] h-[550px] rounded-full blur-[140px] pointer-events-none z-0 transition-opacity duration-500"
        style={{
          background: 'radial-gradient(circle, #fb7185 0%, #e11d48 55%, transparent 80%)',
          opacity: 'var(--mesh-opacity, 0.25)',
        }}
      />

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
