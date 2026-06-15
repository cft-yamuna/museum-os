import type { Sector } from './sector';
import type { Decade } from './decade';

export interface Milestone {
  readonly id: string;
  readonly year: number;
  readonly description: string;
  readonly sector: Sector;
  readonly decade: Decade;
}
