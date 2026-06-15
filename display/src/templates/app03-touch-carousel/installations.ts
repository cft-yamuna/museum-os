/**
 * APP 03 — Touch Carousel Gallery
 * ~11 installations across multiple zones
 *
 * Three display modes:
 * - carousel (default): Auto-play slideshow with dissolve transitions. Touch reveals
 *   bottom carousel strip (iOS Photos-style). Swipe thumbnails to jump. Auto-hides
 *   after inactivity.
 * - slideshow: Auto-play slides with transitions, no interactive carousel strip.
 * - document-viewer: Vertical document pages with horizontal swipe to change documents
 *   and vertical swipe to scroll pages within a document. Used by C-AV03.
 *
 * NOTE: Scrollable content (C-AV01, D-AV02, D-AV06) belongs to Touch Scroll template.
 *       Video loops (H-AV23) belong to APP 04 Media Loop.
 *       Media browsers (F-AV08) belong to APP 06 Media Browser.
 *       Sensor-triggered (H-AV17) belongs to Proximity Trigger template.
 *       Button-triggered video (G-AV12a) belongs to APP 02 Monophone Video.
 */

export interface InstallationDef {
  avCode: string;
  name: string;
  zone: string;
  screen: string;
  notes?: string;
}

export const INSTALLATIONS: InstallationDef[] = [
  // Confirmed carousel-mode installations
  { avCode: 'C-AV02', name: 'MHHP Role in National Building', zone: 'Prologue', screen: '13" touch', notes: 'Photos + videos mix. Carousel on touch.' },
  { avCode: 'C-AV03', name: 'Dr. Gulbanoo Premji', zone: 'Prologue', screen: '13" touch', notes: 'Document viewer mode. 2 documents (1-page + 6-page). Homepage shows both docs side-by-side; tap opens splitscreen reader (zoomed left, overview+caption right). Home button returns to doc selection.' },
  { avCode: 'F-AV03', name: 'PS PAI Images', zone: 'Consumer Care', screen: '13" touch', notes: '10-15s dissolve photo slideshow with carousel on touch.' },
  { avCode: 'F-AV14', name: 'LD Waxson Images', zone: 'Consumer Care', screen: '13" touch' },
  { avCode: 'F-AV18A', name: 'Nirapara Photos/Videos', zone: 'Consumer Care', screen: '13" touch' },
  { avCode: 'F-AV20', name: 'Lighting Product Images/Brochures/Videos', zone: 'Consumer Care', screen: '13" touch' },
  { avCode: 'F-AV21', name: 'Furniture Product Images/Brochures/Videos', zone: 'Consumer Care', screen: '13" touch' },
  { avCode: 'F-AV23', name: 'Product Images/Brochures/Videos', zone: 'Consumer Care', screen: '13" touch' },
  // Query — needs UX decision (may be APP 06 Media Browser or custom)
  { avCode: 'H-AV10a', name: 'GE Interactive Artbook', zone: 'IT Post 2000', screen: '24" touch', notes: 'QUERY: Interactive animated artbook — carousel, Media Browser, or custom?' },
  { avCode: 'H-AV10c', name: 'Nortel Interactive Artbook', zone: 'IT Post 2000', screen: '24" touch', notes: 'QUERY: Interactive animated artbook.' },
  { avCode: 'H-AV11', name: 'Tandem and Sun Microsystems', zone: 'IT Post 2000', screen: '24" touch x 2', notes: 'QUERY: Interactive animated artbook.' },
  { avCode: 'H-AV12d', name: 'Intel Interactive Artbook', zone: 'IT Post 2000', screen: '24" touch', notes: 'QUERY: Interactive animated artbook — subtitled, no audio.' },
  { avCode: 'F-AV06', name: 'Santoor Statistics/Growth', zone: 'Consumer Care', screen: '24" touch 9:16', notes: 'QUERY: 2D/3D HTML5 interactive — may need custom.' },
];
