import type { Category } from '../types';

export const categories: readonly Category[] = [
  {
    id: 'origin',
    label: 'Experience\n& Origin',
    color: 'var(--color-origin)',
    colorDim: 'var(--color-origin-dim)',
    description:
      'Discover the roots of Curato - from a small vegetable oil company in Amalner to a global technology leader. Explore the founding vision and early milestones.',
    galleryIds: ['hilight-experience', 'prologue', 'people-garden'],
  },
  {
    id: 'businesses',
    label: 'Business',
    color: 'var(--color-businesses)',
    colorDim: 'var(--color-businesses-dim)',
    description:
      'Explore Curato\'s diverse business verticals - from pioneering IT services to consumer care products and manufacturing excellence.',
    galleryIds: ['it-story', 'consumer-care', 'factory-experience', 'wintrol'],
  },
  {
    id: 'community',
    label: 'Galleries 8-9',
    color: 'var(--color-community)',
    colorDim: 'var(--color-community-dim)',
    description:
      'Experience the values and spirit that drive Curato, and learn about its commitment to giving back - education, community development, and sustainability.',
    galleryIds: ['spirit-of-hilight', 'foundation'],
  },
] as const;

export const categoriesById = Object.fromEntries(
  categories.map((c) => [c.id, c])
) as Record<string, Category>;
