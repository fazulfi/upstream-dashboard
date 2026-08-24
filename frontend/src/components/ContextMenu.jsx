import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Eye, Copy, X } from 'lucide-react';

export function calculateClampedPosition(x, y, windowWidth, windowHeight) {
  const winW = typeof windowWidth === 'number' ? windowWidth : (typeof window !== 'undefined' ? window.innerWidth : 1024);
  const winH = typeof windowHeight === 'number' ? windowHeight : (typeof window !== 'undefined' ? window.innerHeight : 768);
  const menuWidth = 210;
  const menuHeight = 150;
  const padding = 12;

  let left = typeof x === 'number' ? x : 0;
  let top = typeof y === 'number' ? y : 0;

  if (left + menuWidth > winW - padding) {
    left = Math.max(padding, winW - menuWidth - padding);
  }
  if (top + menuHeight > winH - padding) {
    top = Math.max(padding, winH - menuHeight - padding);
  }
  left = Math.max(padding, left);
  top = Math.max(padding, top);

  return { left, top };
}

export default function ContextMenu({
  isOpen = false,
  x = 0,
  y = 0,
  position,
  model = null,
  target,
  onClose,
  onViewDetails,
  onCopyId,
}) {
  const menuRef = useRef(null);
  const activeModel = model || target;
  const posX = position?.x ?? x;
  const posY = position?.y ?? y;

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      }
    };

    const handlePointerDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const { left, top } = calculateClampedPosition(posX, posY);

  const handleCopy = (e) => {
    e?.stopPropagation();
    const idToCopy = activeModel?.model_id || activeModel?.id || '';
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        navigator.clipboard.writeText(idToCopy).catch(() => {});
      } catch {
        // Safe fallback
      }
    }
    onCopyId?.(activeModel);
    onClose?.();
  };

  const handleViewDetails = (e) => {
    e?.stopPropagation();
    onViewDetails?.(activeModel);
    onClose?.();
  };

  const handleDismiss = (e) => {
    e?.stopPropagation();
    onClose?.();
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-transparent"
        onClick={handleDismiss}
        onContextMenu={(e) => {
          e.preventDefault();
          handleDismiss(e);
        }}
        data-testid="context-menu-backdrop"
      />
      <motion.div
        ref={menuRef}
        role="menu"
        aria-label="Model Context Menu"
        initial={{ opacity: 0, scale: 0.92, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', damping: 24, stiffness: 350 }}
        style={{ top, left }}
        className="fixed z-50 min-w-[200px] p-1.5 rounded-2xl border border-white/20 dark:border-white/10 bg-white/80 dark:bg-zinc-900/80 shadow-2xl backdrop-blur-[40px] text-zinc-800 dark:text-zinc-100 font-sans text-xs select-none"
      >
        <div className="px-3 py-1.5 font-mono text-[10px] uppercase font-bold text-zinc-400 dark:text-zinc-500 border-b border-black/5 dark:border-white/10 truncate">
          {activeModel?.model_id || activeModel?.id || 'Model Actions'}
        </div>
        <div className="py-1 space-y-0.5">
          <button
            type="button"
            role="menuitem"
            onClick={handleViewDetails}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-left cursor-pointer text-zinc-900 dark:text-zinc-100"
          >
            <Eye size={14} className="text-sky-500 shrink-0" />
            <span>View Details</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={handleCopy}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-left cursor-pointer text-zinc-900 dark:text-zinc-100"
          >
            <Copy size={14} className="text-indigo-500 shrink-0" />
            <span>Copy Model ID</span>
          </button>
          <div className="my-1 border-t border-black/5 dark:border-white/10" />
          <button
            type="button"
            role="menuitem"
            onClick={handleDismiss}
            className="flex items-center gap-2.5 w-full px-3 py-1.5 rounded-xl text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-left cursor-pointer"
          >
            <X size={14} className="shrink-0" />
            <span>Dismiss</span>
          </button>
        </div>
      </motion.div>
    </>
  );
}
