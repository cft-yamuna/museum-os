/**
 * CUSTOM 06 — Reception Program Screen
 * A-AV02 / A-AV02a
 *
 * CMS-driven digital signage for the museum reception.
 * - A-AV02: Display screens (3x 24") showing program/event content
 * - A-AV02a: Admin/control interface at reception desk
 *
 * Content is templatized (PPT-like slide input via admin).
 * Slides auto-cycle with transitions.
 */

export interface InstallationDef {
  avCode: string;
  name: string;
  zone: string;
  screen: string;
  notes?: string;
}

export const INSTALLATIONS: InstallationDef[] = [
  {
    avCode: 'A-AV02',
    name: 'Reception Program Screen',
    zone: 'Reception',
    screen: '24" x 3',
    notes: 'Templatized signage. CMS-driven slides: welcome, schedule, events, announcements. Auto-cycling with transitions.',
  },
  {
    avCode: 'A-AV02a',
    name: 'Reception Desk Admin',
    zone: 'Reception',
    screen: 'PC Display',
    notes: 'Admin/control interface for A-AV02. Allows real-time slide management.',
  },
];
