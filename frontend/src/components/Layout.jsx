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
      {/* ── Apple iOS 18 Ambient Mesh Gradient Refraction Wallpaper ── */}
      <div
        className="fixed top-0 -left-20 w-[600px] h-[600px] rounded-full blur-[140px] pointer-events-none z-0 transition-opacity duration-300"
        style={{
          background: 'radial-gradient(circle, #38bdf8 0%, #0284c7 70%, transparent 100%)',
          opacity: 'var(--mesh-opacity, 0.25)',
        }}
      />
      <div
        className="fixed top-12 -right-20 w-[650px] h-[650px] rounded-full blur-[160px] pointer-events-none z-0 transition-opacity duration-300"
        style={{
          background: 'radial-gradient(circle, #818cf8 0%, #4f46e5 70%, transparent 100%)',
          opacity: 'var(--mesh-opacity, 0.25)',
        }}
      />
      <div
        className="fixed -bottom-20 left-1/3 w-[550px] h-[550px] rounded-full blur-[150px] pointer-events-none z-0 transition-opacity duration-300"
        style={{
          background: 'radial-gradient(circle, #34d399 0%, #059669 70%, transparent 100%)',
          opacity: 'var(--mesh-opacity, 0.2)',
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
