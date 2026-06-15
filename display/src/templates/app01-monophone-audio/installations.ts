// ==========================================
// APP 01 — Monophone Audio Player
// ~26 installations across 7 zones
//
// Modes: single (one story per handset) or multi (button-selected stories)
// Source: Museum-OS-App-Catalog.md + Google Sheet briefs
// ==========================================

export interface InstallationDef {
  avCode: string;
  name: string;
  zone: string;
  mode: 'single' | 'multi';
  status: 'confirmed' | 'unconfirmed' | 'query';
  notes?: string;
}

export const INSTALLATIONS: InstallationDef[] = [
  // --- Ambition (D zone) ---
  { avCode: 'D-AV03', name: 'People Garden', zone: 'Ambition', mode: 'multi', status: 'confirmed', notes: 'Welcome message invites user to press buttons, each plays a different audio file. 3-second mute gap between stories, then welcome repeats.' },

  // --- Consumer Care (F zone) ---
  { avCode: 'F-AV01', name: 'AHP Audio Clip — Sunflower Strategy', zone: 'Consumer Care', mode: 'single', status: 'confirmed' },
  { avCode: 'F-AV04', name: '4 Anecdotes of Integrity', zone: 'Consumer Care', mode: 'single', status: 'confirmed' },
  { avCode: 'F-AV09', name: '2 Audio Stories', zone: 'Consumer Care', mode: 'multi', status: 'query', notes: 'Has 2 stories — could be single or multi-button depending on UX decision.' },
  { avCode: 'F-AV16', name: 'Sumit Keshan / Founder Stories', zone: 'Consumer Care', mode: 'single', status: 'confirmed' },
  { avCode: 'F-AV18', name: 'Anil Chugh on Food Business', zone: 'Consumer Care', mode: 'single', status: 'confirmed' },
  { avCode: 'F-AV24', name: 'Audio Stories', zone: 'Consumer Care', mode: 'single', status: 'unconfirmed', notes: 'UNCONFIRMED — present in master design but absent in AV brief.' },
  { avCode: 'F-AV25', name: 'Audio Stories', zone: 'Consumer Care', mode: 'single', status: 'unconfirmed', notes: 'UNCONFIRMED — present in master design but absent in AV brief.' },

  // --- WIN (G zone) ---
  { avCode: 'G-AV03', name: 'WIN Employees Voices', zone: 'WIN', mode: 'single', status: 'query', notes: 'Could be single or multi-button.' },
  { avCode: 'G-AV04', name: 'WIN Employees Voices', zone: 'WIN', mode: 'single', status: 'query', notes: 'Could be single or multi-button.' },
  { avCode: 'G-AV06', name: 'WIN Employees Voices', zone: 'WIN', mode: 'single', status: 'confirmed' },
  { avCode: 'G-AV10', name: 'WIN Employees Voices', zone: 'WIN', mode: 'single', status: 'query', notes: 'Could be single or multi-button.' },

  // --- IT Pre 2000 (H-pre zone) ---
  { avCode: 'H-AV01', name: 'Audio Stories — People\'s Voice', zone: 'IT Pre 2000', mode: 'single', status: 'query', notes: 'Could be single or multi-button.' },
  { avCode: 'H-AV03', name: 'People\'s Voices', zone: 'IT Pre 2000', mode: 'single', status: 'confirmed' },
  { avCode: 'H-AV06', name: 'Ram Agrawal on Museum OS Peripherals', zone: 'IT Pre 2000', mode: 'single', status: 'confirmed' },
  { avCode: 'H-AV07a', name: 'Girish Elchuri Story', zone: 'IT Pre 2000', mode: 'single', status: 'confirmed' },
  { avCode: 'H-AV07c', name: 'Victor Jayakar Story', zone: 'IT Pre 2000', mode: 'single', status: 'confirmed' },
  { avCode: 'H-AV08b', name: 'Prakash Mutalik Story', zone: 'IT Pre 2000', mode: 'single', status: 'confirmed' },
  { avCode: 'H-AV09a', name: 'Hari Shetty Story', zone: 'IT Pre 2000', mode: 'single', status: 'confirmed' },
  { avCode: 'H-AV09b', name: 'Revathi Kasturi Story', zone: 'IT Pre 2000', mode: 'single', status: 'confirmed' },
  { avCode: 'H-AV09c', name: 'KR Sanjeev Story', zone: 'IT Pre 2000', mode: 'single', status: 'confirmed' },

  // --- IT Post 2000 (H-post zone) ---
  { avCode: 'H-AV10b', name: 'Jack Welch Story', zone: 'IT Post 2000', mode: 'single', status: 'confirmed' },
  { avCode: 'H-AV10d', name: 'Nagamani Murthy', zone: 'IT Post 2000', mode: 'single', status: 'confirmed' },
  { avCode: 'H-AV12a', name: '4 Audio Stories', zone: 'IT Post 2000', mode: 'multi', status: 'confirmed' },
  { avCode: 'H-AV12b', name: 'Audio Story', zone: 'IT Post 2000', mode: 'single', status: 'confirmed' },
  { avCode: 'H-AV12c', name: 'Audio Stories X 2', zone: 'IT Post 2000', mode: 'multi', status: 'query', notes: 'Has 2 stories — could be multi-button.' },
  { avCode: 'H-AV13a', name: 'Audio Stories X 2', zone: 'IT Post 2000', mode: 'single', status: 'confirmed' },
  { avCode: 'H-AV13c', name: 'Audio Stories X 2', zone: 'IT Post 2000', mode: 'single', status: 'confirmed' },

  // --- Azim Premji Foundation (J zone) ---
  { avCode: 'J-AV01', name: 'PSN on Museum OS Circles of Responsibility', zone: 'Azim Premji Foundation', mode: 'single', status: 'confirmed' },
];

// --- Lookup helpers ---

export function getInstallation(avCode: string): InstallationDef | undefined {
  for (let i = 0; i < INSTALLATIONS.length; i++) {
    if (INSTALLATIONS[i].avCode === avCode) {
      return INSTALLATIONS[i];
    }
  }
  return undefined;
}

export function getInstallationsByZone(zone: string): InstallationDef[] {
  const result: InstallationDef[] = [];
  for (let i = 0; i < INSTALLATIONS.length; i++) {
    if (INSTALLATIONS[i].zone === zone) {
      result.push(INSTALLATIONS[i]);
    }
  }
  return result;
}

export function getInstallationsByMode(mode: 'single' | 'multi'): InstallationDef[] {
  const result: InstallationDef[] = [];
  for (let i = 0; i < INSTALLATIONS.length; i++) {
    if (INSTALLATIONS[i].mode === mode) {
      result.push(INSTALLATIONS[i]);
    }
  }
  return result;
}

export function getInstallationsByStatus(status: 'confirmed' | 'unconfirmed' | 'query'): InstallationDef[] {
  const result: InstallationDef[] = [];
  for (let i = 0; i < INSTALLATIONS.length; i++) {
    if (INSTALLATIONS[i].status === status) {
      result.push(INSTALLATIONS[i]);
    }
  }
  return result;
}
