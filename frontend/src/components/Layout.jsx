import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import CommandPalette from './CommandPalette';
import { useApi } from '../hooks/useApi';

if (typeof Element !== 'undefined' && typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => {};
}

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
    <div className="layout min-h-screen text-[var(--text-body)] flex flex-col font-sans relative overflow-x-hidden transition-colors duration-500">
      {/* ── Apple iOS 26 Spatial Ambient Mesh Gradient Refraction Wallpaper (700ms Cross-fade) ── */}
      <div
        aria-hidden="true"
        className="ambient-mesh-container fixed inset-0 overflow-hidden pointer-events-none z-0"
        style={{ opacity: 'var(--mesh-opacity, 0.32)' }}
      >
        {/* Dark Mode Mesh Layer */}
        <div className="ambient-mesh ambient-mesh-dark absolute inset-0">
          {/* Top-Left: Electric Sky Blue */}
          <div
            className="ambient-mesh-orb absolute -top-28 -left-28 w-[780px] h-[780px] rounded-full blur-[140px]"
            style={{
              background: 'radial-gradient(circle, #38bdf8 0%, #0284c7 50%, transparent 75%)',
            }}
          />
          {/* Top-Right: Royal Indigo / Violet */}
          <div
            className="ambient-mesh-orb absolute top-0 -right-28 w-[820px] h-[820px] rounded-full blur-[150px]"
            style={{
              background: 'radial-gradient(circle, #818cf8 0%, #6366f1 50%, transparent 75%)',
            }}
          />
          {/* Bottom-Left: Vivid Cyan / Spatial Azure */}
          <div
            className="ambient-mesh-orb absolute -bottom-28 left-1/4 w-[740px] h-[740px] rounded-full blur-[140px]"
            style={{
              background: 'radial-gradient(circle, #06b6d4 0%, #0284c7 50%, transparent 75%)',
            }}
          />
          {/* Center-Right: Sunset Rose */}
          <div
            className="ambient-mesh-orb absolute top-1/3 right-1/4 w-[620px] h-[620px] rounded-full blur-[150px]"
            style={{
              background: 'radial-gradient(circle, #f43f5e 0%, #fb7185 50%, transparent 75%)',
            }}
          />
        </div>

        {/* Light Mode Mesh Layer (Airy, refined pastel tones with iOS saturation) */}
        <div className="ambient-mesh ambient-mesh-light absolute inset-0">
          {/* Top-Left: Soft Azure / Sky */}
          <div
            className="ambient-mesh-orb absolute -top-28 -left-28 w-[780px] h-[780px] rounded-full blur-[140px]"
            style={{
              background: 'radial-gradient(circle, #7dd3fc 0%, #38bdf8 45%, transparent 70%)',
            }}
          />
          {/* Top-Right: Soft Violet / Lavender */}
          <div
            className="ambient-mesh-orb absolute top-0 -right-28 w-[820px] h-[820px] rounded-full blur-[150px]"
            style={{
              background: 'radial-gradient(circle, #a5b4fc 0%, #818cf8 45%, transparent 70%)',
            }}
          />
          {/* Bottom-Left: Soft Cyan / Sky */}
          <div
            className="ambient-mesh-orb absolute -bottom-28 left-1/4 w-[740px] h-[740px] rounded-full blur-[140px]"
            style={{
              background: 'radial-gradient(circle, #67e8f9 0%, #38bdf8 45%, transparent 70%)',
            }}
          />
          {/* Center-Right: Soft Coral / Rose */}
          <div
            className="ambient-mesh-orb absolute top-1/3 right-1/4 w-[620px] h-[620px] rounded-full blur-[150px]"
            style={{
              background: 'radial-gradient(circle, #fda4af 0%, #f43f5e 45%, transparent 70%)',
            }}
          />
        </div>
      </div>

      {/* Mobile Drawer & Desktop Persistent Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main App Content Column (Offset right on desktop for persistent w-64 sidebar) */}
      <div className="flex-1 flex flex-col lg:pl-64 min-w-0 transition-all duration-300">
        {/* Topbar Header */}
        <div className="sticky top-0 z-40">
          <Topbar
            onOpenSearch={() => setSearchOpen(true)}
            onToggleSidebar={toggleSidebar}
          />
        </div>

        {/* Main Content Workspace */}
        <main className="main flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto space-y-6 relative z-10">
          <Outlet context={{ data }} />
        </main>
      </div>

      {/* Global Command Palette */}
      {searchOpen && <CommandPalette isOpen={searchOpen} onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
