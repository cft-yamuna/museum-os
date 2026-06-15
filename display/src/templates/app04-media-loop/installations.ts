/**
 * APP 04 — Media Loop / Signage Player
 * ~14 installations across multiple zones
 *
 * Zero interaction. Content plays on loop — video, auto-cycling slideshow,
 * or ambient audio on directional speakers.
 */

export interface InstallationDef {
  avCode: string;
  name: string;
  zone: string;
  screen: string;
  mode: 'video-loop' | 'slideshow' | 'audio';
  notes?: string;
}

export const INSTALLATIONS: InstallationDef[] = [
  // A-AV02/02a moved to custom06-reception-program
  { avCode: 'D-AV04', name: 'Projection on Fabric', zone: 'Ambition', screen: 'Projector 1920x1200', mode: 'video-loop', notes: 'Photos coming out of box animation. First/last frame matched.' },
  { avCode: 'D-AV07', name: '3x Speakers above Benches', zone: 'Ambition', screen: 'No screen', mode: 'audio', notes: 'Audio loop on directional shower speakers. Natural garden sounds.' },
  { avCode: 'E-AV02', name: 'Voices of Key People', zone: 'Factory Experience', screen: 'No screen', mode: 'audio', notes: 'DROPPED as of 05/12/2028. Audio loop synced with flip wall storyboard.' },
  { avCode: 'E-AV03', name: 'Amalner Factory Logo Wall', zone: 'Factory Experience', screen: '24"', mode: 'video-loop', notes: 'Continuous video loop, no audio. Fade to black, repeat.' },
  { avCode: 'F-AV13', name: 'Yardley Timeline Video', zone: 'Consumer Care', screen: '24"', mode: 'video-loop', notes: 'Fade to black, 5s pause, repeat.' },
  { avCode: 'G-AV12b', name: 'Infrastructure/Mfg Videos', zone: 'WIN', screen: '32"', mode: 'video-loop', notes: 'No audio. Fade to black, 5s pause, repeat.' },
  { avCode: 'G-AV12c', name: 'Infrastructure/Mfg Videos', zone: 'WIN', screen: '32"', mode: 'video-loop' },
  { avCode: 'H-AV15', name: 'NYSE', zone: 'IT Post 2000', screen: '32"', mode: 'video-loop', notes: 'Fade to black, 5s pause, repeat.' },
  { avCode: 'H-AV22c', name: 'Museum OS Innovation Network', zone: 'IT Post 2000', screen: '55" x 6 wall', mode: 'video-loop', notes: 'Perpetual animation. Seamless loop, first/last frame match. No audio.' },
  { avCode: 'J-AV03', name: 'Museum OS-Nat Geo Butterfly Effect Film', zone: 'Azim Premji Foundation', screen: '24"', mode: 'video-loop', notes: 'Audio on shower speakers. Fade to black, 5s pause, repeat.' },
  { avCode: 'D-AV01', name: 'Amalner Video x 3', zone: 'Ambition', screen: '24" x 3', mode: 'video-loop', notes: 'Three videos of different durations playing off-sync. Three independent loops.' },
];
