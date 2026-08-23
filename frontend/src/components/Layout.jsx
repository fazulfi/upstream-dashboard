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
        aria-hidden="true"
        className="fixed inset-0 overflow-hidden pointer-events-none z-0 transition-opacity duration-700"
        style={{ opacity: 'var(--mesh-opacity, 0.20)' }}
      >
        {/* Top-Left: Sky Blue */}
        <div
          className="absolute -top-20 -left-20 w-[720px] h-[720px] rounded-full blur-[140px]"
          style={{
            background: 'radial-gradient(circle, #38bdf8 0%, #7dd3fc 45%, transparent 75%)',
          }}
        />
        {/* Top-Right: Violet / Indigo */}
        <div
          className="absolute top-4 -right-20 w-[780px] h-[780px] rounded-full blur-[150px]"
          style={{
            background: 'radial-gradient(circle, #c084fc 0%, #818cf8 45%, transparent 75%)',
          }}
        />
        {/* Bottom-Left: Emerald / Mint */}
        <div
          className="absolute -bottom-20 left-1/4 w-[680px] h-[680px] rounded-full blur-[140px]"
          style={{
            background: 'radial-gradient(circle, #34d399 0%, #6ee7b7 45%, transparent 75%)',
          }}
        />
        {/* Center-Right: Rose / Coral */}
        <div
          className="absolute top-1/2 right-1/4 w-[580px] h-[580px] rounded-full blur-[150px]"
          style={{
            background: 'radial-gradient(circle, #fb7185 0%, #fda4af 45%, transparent 75%)',
          }}
        />
      </div>

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
