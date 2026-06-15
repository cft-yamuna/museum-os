import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="admin-card flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md border border-surface-200 bg-surface-50">
        <Icon className="h-5 w-5 text-surface-500" />
      </div>
      <h3 className="mb-1 text-base font-semibold text-surface-900">{title}</h3>
      <p className="mb-5 max-w-md text-sm leading-6 text-surface-500">{description}</p>
      {action}
    </div>
  );
}
