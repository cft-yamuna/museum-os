import { useToastStore } from '../../stores/toast';
import { X, CheckCircle, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const colors = {
  success: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500 backdrop-blur-xl',
  error: 'bg-red-500/10 border-red-500/20 text-red-500 backdrop-blur-xl',
  warning: 'bg-amber-500/10 border-amber-500/20 text-amber-500 backdrop-blur-xl',
  info: 'bg-sky-500/10 border-sky-500/20 text-sky-500 backdrop-blur-xl',
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon = icons[toast.type];
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 50, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 50, scale: 0.95 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className={clsx(
                'flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-2xl',
                colors[toast.type]
              )}
            >
              <Icon className="h-5 w-5 mt-0.5 shrink-0" />
              <p className="text-sm flex-1">{toast.message}</p>
              <button
                onClick={() => removeToast(toast.id)}
                className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
