import React from 'react';

export function Skeleton({ w = '100%', h = 14, className = '', style = {} }) {
  return (
    <div
      aria-hidden="true"
      className={`relative overflow-hidden rounded bg-zinc-800/60 before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-zinc-700/30 before:to-transparent ${className}`}
      style={{ width: w, height: h, ...style }}
    />
  );
}

export function SkeletonCard({ className = '' }) {
  return (
    <div className={`p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-3 ${className}`}>
      <div className="flex justify-between items-center">
        <Skeleton w="40%" h={14} />
        <Skeleton w={24} h={24} className="rounded-md" />
      </div>
      <Skeleton w="70%" h={28} />
      <div className="pt-2 border-t border-zinc-800/50 flex justify-between">
        <Skeleton w="30%" h={12} />
        <Skeleton w="25%" h={12} />
      </div>
    </div>
  );
}

export function SkeletonBlock({ children, loading, rows = 4, skeleton }) {
  if (!loading) return children;
  return (
    <div role="status" aria-label="Loading" className="space-y-3 py-2">
      {skeleton ||
        Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4 py-2 border-b border-zinc-800/40">
            <Skeleton w="55%" h={14} />
            <Skeleton w="25%" h={14} />
            <Skeleton w="15%" h={14} />
          </div>
        ))}
    </div>
  );
}
