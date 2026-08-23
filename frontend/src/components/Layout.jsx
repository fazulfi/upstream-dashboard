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
        style={{ opacity: 'var(--mesh-opacity, 0.40)' }}
      >
        {/* Top-Left: Electric Sky Blue */}
        <div
          className="absolute -top-28 -left-28 w-[780px] h-[780px] rounded-full blur-[140px]"
          style={{
            background: 'radial-gradient(circle, #38bdf8 0%, #0284c7 50%, transparent 75%)',
          }}
        />
        {/* Top-Right: Royal Indigo / Violet */}
        <div
          className="absolute top-0 -right-28 w-[820px] h-[820px] rounded-full blur-[150px]"
          style={{
            background: 'radial-gradient(circle, #818cf8 0%, #6366f1 50%, transparent 75%)',
          }}
        />
        {/* Bottom-Left: Vivid Apple Mint */}
        <div
          className="absolute -bottom-28 left-1/4 w-[740px] h-[740px] rounded-full blur-[140px]"
          style={{
            background: 'radial-gradient(circle, #34d399 0%, #10b981 50%, transparent 75%)',
          }}
        />
        {/* Center-Right: Sunset Rose */}
        <div
          className="absolute top-1/3 right-1/4 w-[620px] h-[620px] rounded-full blur-[150px]"
          style={{
            background: 'radial-gradient(circle, #f43f5e 0%, #fb7185 50%, transparent 75%)',
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
