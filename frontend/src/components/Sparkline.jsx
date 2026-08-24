/**
 * Sparkline — mini area/line chart with Apple HIG gradient volume and crisp stroke.
 * Data: array of numeric values. Renders native SVG for maximum lightweight performance.
 */
import React, { useId } from 'react';

export default function Sparkline({
  data,
  color = 'var(--accent)',
  height = 32,
  width = 120,
  className = '',
}) {
  const gradientId = useId();
  const cleanGradId = `sp-${gradientId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  if (!data || data.length < 2) {
    return (
      <div
        className={`sparkline empty flex items-center justify-center rounded-lg bg-black/[0.02] dark:bg-white/[0.02] ${className}`}
        style={{ height, width }}
        aria-hidden="true"
      />
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = Math.max(1, Math.floor(data.length / 60));

  const filtered = data.filter((_, i) => i % step === 0);
  const pts = filtered.map((v, i, arr) => {
    const x = (i / (arr.length - 1)) * width;
    const y = height - 3 - ((v - min) / range) * (height - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const line = pts.join(' ');
  const area = `0,${height} ${line} ${width},${height}`;

  return (
    <svg
      className={`sparkline overflow-visible ${className}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={cleanGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.30" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${cleanGradId})`} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
