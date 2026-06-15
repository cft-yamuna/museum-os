export const Sector = {
  IT: 'IT',
  Sustainability: 'Sustainability',
  ConsumerCare: 'ConsumerCare',
  WiN: 'WiN',
  GEJV: 'GEJV',
  Foundation: 'Foundation',
  General: 'General',
  ViewAll: 'ViewAll',
} as const;

export type Sector = (typeof Sector)[keyof typeof Sector];

export interface SectorConfig {
  readonly id: Sector | string;
  readonly label: string;
  readonly color: string;
  readonly glowColor: string;
}

export interface DandelionHandle {
  readonly getContainer: () => HTMLDivElement | null;
  readonly killTweens: () => void;
  readonly restartTweens: () => void;
}
