import clsx from 'clsx';

interface BadgeProps {
  variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'unavailable';
  children: React.ReactNode;
  className?: string;
}

const variants = {
  success: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20',
  warning: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20',
  danger: 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20',
  info: 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20',
  neutral: 'bg-surface-100 text-surface-700 border border-surface-200',
  unavailable: 'bg-surface-100 text-surface-500 border border-dashed border-surface-300 dark:bg-surface-100/40 dark:text-surface-400',
};

export function Badge({ variant, children, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
