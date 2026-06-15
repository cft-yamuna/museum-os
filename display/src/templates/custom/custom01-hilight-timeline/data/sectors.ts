import { Sector } from '../types';
import type { SectorConfig } from '../types';

export const SECTOR_CONFIGS: readonly SectorConfig[] = [
  {
    id: Sector.IT,
    label: 'IT',
    color: '#5072b6',
    glowColor: 'rgba(80, 114, 182, 0.4)',
  },
  {
    id: Sector.Sustainability,
    label: 'Sustainability',
    color: '#70a363',
    glowColor: 'rgba(112, 163, 99, 0.4)',
  },
  {
    id: Sector.ConsumerCare,
    label: 'Consumer\nCare',
    color: '#f58d53',
    glowColor: 'rgba(245, 141, 83, 0.4)',
  },
  {
    id: Sector.WiN,
    label: 'WIN',
    color: '#7676b3',
    glowColor: 'rgba(118, 118, 179, 0.4)',
  },
  {
    id: Sector.GEJV,
    label: 'GE-JV',
    color: '#6fc5b1',
    glowColor: 'rgba(111, 197, 177, 0.4)',
  },
  {
    id: Sector.Foundation,
    label: 'Foundation',
    color: '#349bb3',
    glowColor: 'rgba(52, 155, 179, 0.4)',
  },
  {
    id: Sector.General,
    label: 'General\nCompany\nEvents',
    color: '#f48182',
    glowColor: 'rgba(244, 129, 130, 0.4)',
  },
  {
    id: Sector.ViewAll,
    label: 'View All',
    color: '#888888',
    glowColor: 'rgba(136, 136, 136, 0.4)',
  },
] as const;
