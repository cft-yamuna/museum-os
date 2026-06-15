/**
 * APP 06 — Touch Media Browser
 * ~10 installations across multiple zones
 *
 * Browsable interface for exploring mixed media content — PDFs, photos,
 * videos, text, infographics. Category-based navigation with optional search.
 */

export interface InstallationDef {
  avCode: string;
  name: string;
  zone: string;
  screen: string;
  notes?: string;
}

export const INSTALLATIONS: InstallationDef[] = [
  { avCode: 'F-AV05', name: 'Brand/Product TV Commercials', zone: 'Consumer Care', screen: '13" touch x 2', notes: 'Currently tagged as Monophone but UX says media browser.' },
  { avCode: 'G-AV01', name: 'Old Product Brochures', zone: 'WIN', screen: '13" touch' },
  { avCode: 'G-AV02', name: 'Hydraulic Cylinders Info', zone: 'WIN', screen: '13" touch' },
  { avCode: 'H-AV04', name: 'Series 386 Articles and Brochures', zone: 'IT Pre 2000', screen: '-', notes: 'Currently tagged as Audio/Soundscape but UX says media browser.' },
  { avCode: 'H-AV07b', name: 'Monterey Bay Pictures + Chronicles of Innovation', zone: 'IT Pre 2000', screen: '13" touch x 2' },
  { avCode: 'H-AV13e', name: 'Brochure, CNBC', zone: 'IT Post 2000', screen: '13" touch x 2', notes: 'May not be required.' },
  { avCode: 'H-AV14a', name: 'Rearticulation of Beliefs', zone: 'IT Post 2000', screen: '13" touch' },
  { avCode: 'I-AV01B', name: 'Learning, Inclusion and Wellbeing', zone: 'Spirit of Museum OS', screen: '13" touch x 3', notes: 'Browsable images/videos/text.' },
  { avCode: 'K-AV01', name: 'Browsable Infographics/Images/Text', zone: 'Community & Environment', screen: '13" touch x 4' },
  { avCode: 'F-AV08', name: 'Santoor Interactive Infographics/Stories', zone: 'Consumer Care', screen: '24" touch x 3', notes: 'Could also be Carousel; depends on content depth.' },
];
