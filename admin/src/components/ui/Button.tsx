import clsx from 'clsx';
import { Spinner } from './Spinner';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: React.ReactNode;
}

const variants = {
  primary: 'border border-blue-700 bg-blue-700 text-white hover:bg-blue-800 dark:border-blue-500 dark:bg-blue-600 dark:hover:bg-blue-500',
  secondary: 'card-bg text-surface-800 border border-surface-300 hover:bg-surface-50',
  danger: 'bg-red-600 text-white hover:bg-red-700 border border-red-600',
  ghost: 'text-surface-700 hover:bg-surface-100 border border-transparent',
};

const sizes = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--page-bg)] disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}
