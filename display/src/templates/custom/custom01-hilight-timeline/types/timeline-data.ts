export interface DandelionPlacement {
  x: number;
  y: number;
  size: number;
  delay: number;
}

export interface DandelionConfig {
  sector: {
    id: string;
    label: string;
    color: string;
    glowColor: string;
  };
  placement: DandelionPlacement;
}

export interface TimelineMilestone {
  id: string;
  year: number;
  yearLabel?: string;
  description: string;
  sectorId: string;
  decade: string;
}

export interface TimelineData {
  dandelions: DandelionConfig[];
  milestones: TimelineMilestone[];
}
