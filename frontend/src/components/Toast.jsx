import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2, 5);
    setToasts((prev) => [...prev, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, toast: addToast, success: (msg) => addToast(msg, 'success'), error: (msg) => addToast(msg, 'error'), warn: (msg) => addToast(msg, 'warning') }}>
      {children}
      <div className="fixed top-8 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none px-4 sm:px-0 items-center">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -40, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.15 } }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className={`ios-notification pointer-events-auto flex items-start gap-3 p-4 w-full text-xs font-medium text-[var(--text-title)]`}
            >
              <div className="mt-0.5 shrink-0">
                {t.type === 'success' && <CheckCircle2 size={16} className="text-sky-600 dark:text-sky-400" />}
                {t.type === 'error' && <AlertCircle size={16} className="text-rose-600 dark:text-rose-400" />}
                {t.type === 'warning' && <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400" />}
                {t.type === 'info' && <Info size={16} className="text-sky-600 dark:text-sky-400" />}
              </div>
              <div className="flex-1 leading-snug break-words">{t.message}</div>
              <button
                onClick={() => removeToast(t.id)}
                className="shrink-0 p-0.5 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors rounded cursor-pointer"
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      addToast: (msg) => console.log('Toast:', msg),
      toast: (msg) => console.log('Toast:', msg),
      success: (msg) => console.log('Success:', msg),
      error: (msg) => console.error('Error:', msg),
      warn: (msg) => console.warn('Warn:', msg),
    };
  }
  return ctx;
}
