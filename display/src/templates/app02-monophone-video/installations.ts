/**
 * APP 02 — Monophone Video+Audio Player
 * ~24 installations across multiple zones
 *
 * Screen shows poster/artwork as idle. Handset pickup triggers video playback
 * with audio routed to handset speaker. Some have button selection, some have
 * background video walls.
 */

export interface InstallationDef {
  avCode: string;
  name: string;
  zone: string;
  screen: string;
  selectionMode: 'single' | 'button';
  hasBackgroundLoop?: boolean;
  notes?: string;
}

export const INSTALLATIONS: InstallationDef[] = [
  { avCode: 'B-AV02', name: 'Chairman\'s Welcome Note', zone: 'Curato Experiences', screen: '24"', selectionMode: 'single', notes: 'Sensor triggers fade-through-color transition.' },
  { avCode: 'F-AV02', name: 'The Vanaspati Story', zone: 'Consumer Care', screen: '22" CRT 720x576 4:3', selectionMode: 'single', notes: 'Old-looking artwork as idle frame. Two UX options.' },
  { avCode: 'F-AV07', name: 'Santoor TV Commercials', zone: 'Consumer Care', screen: '13" x 8', selectionMode: 'button', notes: 'Button-based selection. Hard-wired to labeled buttons.' },
  { avCode: 'F-AV07.1', name: 'Vineet Agarwal on Unza Santoor', zone: 'Consumer Care', screen: '24"', selectionMode: 'single' },
  { avCode: 'F-AV10', name: 'Glucovita & Chandrika', zone: 'Consumer Care', screen: '13" touch', selectionMode: 'single', notes: 'Open question: convert to touch-only?' },
  { avCode: 'F-AV11', name: 'Vineet Agarwal on Unza', zone: 'Consumer Care', screen: '24"', selectionMode: 'single' },
  { avCode: 'F-AV12', name: 'Spirit of Curato-Unza Video', zone: 'Consumer Care', screen: '13" touch', selectionMode: 'single' },
  { avCode: 'F-AV15', name: 'Vineet Agarwal on Unza', zone: 'Consumer Care', screen: '24"', selectionMode: 'single' },
  { avCode: 'F-AV19', name: 'Vineet Agarwal on Unza', zone: 'Consumer Care', screen: '13"', selectionMode: 'single' },
  { avCode: 'G-AV14a', name: 'Pratik Kumar — Head WIN Business', zone: 'WIN', screen: '13"', selectionMode: 'single' },
  { avCode: 'H-AV02', name: 'Making of the First Computer', zone: 'IT Pre 2000', screen: '13" x 2', selectionMode: 'single' },
  { avCode: 'H-AV08a', name: 'Instaplan Story', zone: 'IT Pre 2000', screen: '24" touch', selectionMode: 'single' },
  { avCode: 'H-AV13b', name: 'CMM', zone: 'IT Post 2000', screen: '13" touch', selectionMode: 'single' },
  { avCode: 'H-AV13d', name: 'Six Sigma', zone: 'IT Post 2000', screen: '13"', selectionMode: 'single' },
  { avCode: 'H-AV14b', name: 'From Bombay to Bangalore', zone: 'IT Post 2000', screen: '24"', selectionMode: 'single' },
  { avCode: 'H-AV19a', name: 'Engineering Momentum', zone: 'IT Post 2000', screen: '55" 5120x2880', selectionMode: 'single', notes: 'Highest resolution in the museum.' },
  { avCode: 'H-AV19c', name: 'Curato Ventures', zone: 'IT Post 2000', screen: '-', selectionMode: 'single', hasBackgroundLoop: true, notes: 'Split-screen with video and audio playback options.' },
  { avCode: 'H-AV20a', name: 'Early Bets on Design', zone: 'IT Post 2000', screen: '55" x 4 wall', selectionMode: 'single', hasBackgroundLoop: true, notes: 'Background video loops independently.' },
  { avCode: 'H-AV20b', name: 'Early Bets on Design', zone: 'IT Post 2000', screen: '55" x 4 wall', selectionMode: 'single', hasBackgroundLoop: true },
  { avCode: 'H-AV20c', name: 'Big Bets & Strategic Investments', zone: 'IT Post 2000', screen: '55" x 6 wall', selectionMode: 'single', hasBackgroundLoop: true },
  { avCode: 'H-AV20d', name: 'Big Bets & Strategic Investments', zone: 'IT Post 2000', screen: '55" x 6 wall', selectionMode: 'single', hasBackgroundLoop: true },
  { avCode: 'H-AV21a', name: 'Brand and Identity', zone: 'IT Post 2000', screen: '55" x 6 wall', selectionMode: 'single', hasBackgroundLoop: true, notes: 'Choreographed foreground sync. Touch table interaction.' },
  { avCode: 'H-AV21b', name: 'Brand and Identity', zone: 'IT Post 2000', screen: '55" x 6 wall', selectionMode: 'single', hasBackgroundLoop: true },
  { avCode: 'H-AV22a', name: 'Reinvention Intro', zone: 'IT Post 2000', screen: '24"', selectionMode: 'single' },
  { avCode: 'H-AV22b', name: 'Bold Bets on AI', zone: 'IT Post 2000', screen: '24"', selectionMode: 'single' },
  { avCode: 'I-AV01A', name: 'Rishad Premji / Culture Conversations', zone: 'Spirit of Curato', screen: '24"', selectionMode: 'single', notes: 'Content from existing clips + new footage.' },
];
