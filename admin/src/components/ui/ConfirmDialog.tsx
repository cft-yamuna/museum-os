import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'primary' | 'danger';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  useEffect(() => {
    if (open && dialogRef.current) {
      dialogRef.current.focus();
    }
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onCancel}
          />

          {/* Dialog */}
          <motion.div
            ref={dialogRef}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="relative card-bg-solid rounded-2xl shadow-2xl border border-surface-200 w-full max-w-md p-8 space-y-6 outline-none"
          >
            {/* Close button */}
            <button
              onClick={onCancel}
              aria-label="Close dialog"
              className="absolute top-4 right-4 h-9 w-9 flex items-center justify-center rounded-xl text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="pr-8">
              <h3 className="font-bold text-surface-900" style={{ fontSize: '20px' }}>{title}</h3>
              <p className="text-surface-500 mt-2" style={{ fontSize: '14px', lineHeight: '1.6' }}>{message}</p>
            </div>

            <div className="flex items-center justify-end gap-3">
              <Button
                variant="secondary"
                onClick={onCancel}
                disabled={loading}
                className="h-10 px-5 rounded-xl"
              >
                {cancelLabel}
              </Button>
              <Button
                variant={variant === 'danger' ? 'danger' : 'primary'}
                onClick={onConfirm}
                loading={loading}
                className="h-10 px-5 rounded-xl"
              >
                {confirmLabel}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
