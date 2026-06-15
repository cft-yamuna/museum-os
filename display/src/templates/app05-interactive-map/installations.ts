/**
 * APP 05 — Interactive Map / Wayfinding
 * 3 installations
 *
 * Always-on facility/world map with touch zones. Touch a section to highlight
 * with animation, show subsections with time estimates, reveal POI markers.
 */

export interface InstallationDef {
  avCode: string;
  name: string;
  zone: string;
  screen: string;
  notes?: string;
}

export const INSTALLATIONS: InstallationDef[] = [
  { avCode: 'A-AV01', name: 'Navigation Map', zone: 'Reception', screen: '55" 4K touch', notes: 'Four section buttons (Origin, Business, Culture, Philanthropy). Touch section shows POIs with time estimates.' },
  { avCode: 'D-AV05', name: 'Navigation Map (Duplicate)', zone: 'Ambition', screen: '55" 4K touch', notes: 'Same content as A-AV01. Touch section shows animated pathway for guided access.' },
  { avCode: 'G-AV14', name: 'WIN Locations Interactive Infographic', zone: 'WIN', screen: '65" touch', notes: 'World map with WIN business locations. Touch location shows animated popup. Currently assigned to Carousel but functionally a map app.' },
];
