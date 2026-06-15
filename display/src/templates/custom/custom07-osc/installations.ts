/**
 * CUSTOM 07 — OSC Trigger App
 *
 * Receives OSC signals to trigger video playback.
 * Shows an idle image until triggered, plays video, returns to idle.
 */

export interface InstallationDef {
  avCode: string;
  name: string;
  zone: string;
  screen?: string;
  notes?: string;
}

export const INSTALLATIONS: InstallationDef[] = [
  {
    avCode: 'B-AV02',
    name: 'OSC Triggered Video',
    zone: 'Gallery',
    screen: '24"',
    notes: 'OSC trigger on /b-av02 plays video, returns to idle image on end.',
  },
];
