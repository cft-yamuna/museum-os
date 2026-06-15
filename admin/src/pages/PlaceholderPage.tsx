import { Construction } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';

interface PlaceholderPageProps {
  title: string;
}

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-surface-900 mb-6">{title}</h1>
      <EmptyState
        icon={Construction}
        title="Coming Soon"
        description={`The ${title} page is under construction.`}
      />
    </div>
  );
}
