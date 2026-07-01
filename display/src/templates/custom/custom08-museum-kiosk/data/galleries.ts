import type { Gallery } from '../types';

export const galleries: readonly Gallery[] = [
  {
    id: 'hilight-experience',
    name: 'The Curato Ethos',
    color: 'var(--color-hilight-experience)',
    cardColor: '#963C3C',
    categoryId: 'origin',
    svgGroupId: 'hilightexperience',
    textGroupId: 'Layer_1-2-g-1-text-6',
    timeToExplore: '15\u201320 min',
    description:
      'The values and culture that have shaped Curato from the beginning.',
    highlightIds: ['hilight-exp-immersive', 'hilight-exp-timeline'],
  },
  {
    id: 'prologue',
    name: 'A Very Small Company',
    color: 'var(--color-prologue)',
    cardColor: '#634329',
    categoryId: 'origin',
    svgGroupId: 'Proluge',
    textGroupId: 'Layer_1-2-g-1-text-7',
    timeToExplore: '10\u201315 min',
    description:
      'Early milestones and pivotal choices that set Curato on its path.',
    highlightIds: ['prologue-desk', 'prologue-timeline'],
  },
  {
    id: 'people-garden',
    name: 'People Garden',
    color: 'var(--color-people-garden)',
    cardColor: '#936F51',
    categoryId: 'origin',
    svgGroupId: 'gallery_people_garden',
    textGroupId: 'Layer_1-2-g-1-text-8',
    timeToExplore: '10\u201315 min',
    description:
      'The people, across generations, who built and shaped Curato.',
    highlightIds: [],
  },
  {
    id: 'it-story',
    name: 'Curato Ltd.',
    color: 'var(--color-it-story)',
    cardColor: '#0C3C75',
    categoryId: 'businesses',
    svgGroupId: 'IT_Story',
    textGroupId: '',
    timeToExplore: '15\u201320 min',
    description:
      'Five decades of reinvention: from hardware beginnings to the age of Artificial Intelligence.',
    highlightIds: ['it-story-server', 'it-story-milestones'],
  },
  {
    id: 'consumer-care',
    name: 'Curato Consumer Care & Lighting Group',
    color: 'var(--color-consumer-care)',
    cardColor: '#C16E14',
    categoryId: 'businesses',
    svgGroupId: 'Consumer_c',
    textGroupId: 'Layer_1-2-g-1-text-2',
    timeToExplore: '10\u201315 min',
    description:
      'The making of an Indian multinational: driven by Santoor, one of India\'s most trusted brands.',
    highlightIds: ['consumer-care-products', 'consumer-care-ads'],
  },
  {
    id: 'factory-experience',
    name: 'A Factory Experience',
    color: 'var(--color-factory-experience)',
    cardColor: '#053D32',
    categoryId: 'businesses',
    svgGroupId: 'FACTORY_Experience',
    textGroupId: 'Layer_1-2-g-1-text-3',
    timeToExplore: '15\u201320 min',
    description:
      'An immersive recreation of manufacturing at Curato\'s Amalner factory.',
    highlightIds: ['factory-line', 'factory-machines'],
  },
  {
    id: 'wintrol',
    name: 'Curato Infrastructure Engineering',
    color: 'var(--color-wintrol)',
    cardColor: '#8484C7',
    categoryId: 'businesses',
    svgGroupId: 'wintrol',
    textGroupId: 'Layer_1-2-g-1-text-4',
    timeToExplore: '10\u201315 min',
    description:
      'From a modest diversification to a global presence in precision engineering and manufacturing.',
    highlightIds: ['wintrol-innovation', 'wintrol-collab'],
  },
  {
    id: 'spirit-of-hilight',
    name: 'Spirit of Curato',
    color: 'var(--color-spirit-of-hilight)',
    cardColor: '#0C4728',
    categoryId: 'community',
    svgGroupId: 'spirit_of_hiLight',
    textGroupId: 'Layer_1-2-g-1-text-5',
    timeToExplore: '10\u201315 min',
    description:
      'How responsibility evolved into a defining part of Curato\'s identity.',
    highlightIds: ['spirit-pillars', 'spirit-values'],
  },
  {
    id: 'foundation',
    name: 'Azim Premji Foundation',
    color: 'var(--color-foundation)',
    cardColor: '#094C4C',
    categoryId: 'community',
    svgGroupId: 'Foundation',
    textGroupId: 'Layer_1-2-g-1-text-1',
    timeToExplore: '10\u201315 min',
    description:
      'The Foundation\'s work across education, health, and livelihoods\u2014and its role as the majority shareholder of Curato Limited.',
    highlightIds: ['foundation-education', 'foundation-impact'],
  },
] as const;

export const galleriesById = Object.fromEntries(
  galleries.map((g) => [g.id, g])
) as Record<string, Gallery>;

export const galleryBySvgGroupId = new Map(
  galleries.map((g) => [g.svgGroupId, g])
);
