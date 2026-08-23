import React, { useState, useRef } from 'react';
import { motion, useMotionValue, useTransform } from 'motion/react';
import { ShieldAlert, Check, ArrowRight, ShieldCheck } from 'lucide-react';

export default function SlideToConfirm({
  onConfirm,
  label = 'Slide to confirm',
  confirmedLabel = 'Confirmed',
  variant = 'danger',
  disabled = false,
  loading = false,
}) {
  const [confirmed, setConfirmed] = useState(false);
  const containerRef = useRef(null);
  const x = useMotionValue(0);

  const isDanger = variant === 'danger';
  const bgClass = isDanger ? 'bg-rose-500/10 border-rose-500/30' : 'bg-sky-500/10 border-sky-500/30';
  const handleBg = isDanger ? 'bg-rose-600 text-white' : 'bg-sky-600 text-white';

  const handleDragEnd = (_, info) => {
    if (disabled || loading || confirmed) return;
    const containerWidth = containerRef.current?.offsetWidth || 240;
    const threshold = containerWidth - 52;

    if (info.offset.x >= threshold * 0.75) {
      setConfirmed(true);
      x.set(threshold);
      onConfirm?.();
      setTimeout(() => {
        setConfirmed(false);
        x.set(0);
      }, 2500);
    } else {
      x.set(0);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative h-11 w-full max-w-[280px] rounded-lg border flex items-center select-none overflow-hidden transition-all ${bgClass} ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      }`}
    >
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="text-xs font-semibold tracking-wide text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5 opacity-90">
          {loading ? (
            'Processing...'
          ) : confirmed ? (
            <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-bold">
              <ShieldCheck size={14} /> {confirmedLabel}
            </span>
          ) : (
            <>
              <span>{label}</span>
              <ArrowRight size={13} className="animate-pulse" />
            </>
          )}
        </span>
      </div>

      {!confirmed && !loading && (
        <motion.div
          drag={disabled ? false : 'x'}
          dragConstraints={{ left: 0, right: 220 }}
          dragElastic={0.1}
          dragSnapToOrigin={!confirmed}
          onDragEnd={handleDragEnd}
          style={{ x }}
          whileTap={{ scale: 0.96 }}
          className={`absolute left-1 top-1 bottom-1 w-9 rounded-md flex items-center justify-center cursor-grab active:cursor-grabbing shadow-md z-10 transition-colors ${handleBg}`}
        >
          {isDanger ? <ShieldAlert size={16} /> : <ShieldCheck size={16} />}
        </motion.div>
      )}
    </div>
  );
}
