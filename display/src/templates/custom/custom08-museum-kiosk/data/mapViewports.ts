import type { CategoryId, GalleryId, MapViewport } from '../types';

/**
 * Pre-computed CSS transforms for each view state.
 * These control the zoom/pan of the map container.
 * Values are calibrated for the isometric museum SVG map
 * (viewBox 3486.6 x 2007.2).
 *
 * Transform origin is center center.
 * Format: translate(x%, y%) scale(s)
 */

export const screensaverViewport: MapViewport = {
  transform: 'translate(0px, 0px) scale(1)',
  label: 'Full map overview',
};

export const categoriesViewport: MapViewport = {
  transform: 'translate(0px, -3%) scale(0.95)',
  label: 'Gallery selection',
};

/**
 * Gallery viewports -- zoomed into individual gallery.
 * 2.4x zoom provides focus by pushing non-active galleries off-screen.
 */
export const galleryViewports: Record<GalleryId, MapViewport> = {
  prologue: {
    transform: 'translate(57%, -21%) scale(2.4)',
    label: 'Prologue gallery',
  },
  'hilight-experience': {
    transform: 'translate(21%, -6%) scale(2.4)',
    label: 'Curato Experience gallery',
  },
  'people-garden': {
    transform: 'translate(82%, -1%) scale(2.4)',
    label: 'People Garden gallery',
  },
  'it-story': {
    transform: 'translate(54%, 37%) scale(2.4)',
    label: 'IT Story gallery',
  },
  'consumer-care': {
    transform: 'translate(91%, 22%) scale(2.4)',
    label: 'Consumer Care gallery',
  },
  'factory-experience': {
    transform: 'translate(101%, -21%) scale(2.4)',
    label: 'Factory Experience gallery',
  },
  'spirit-of-hilight': {
    transform: 'translate(37%, 35%) scale(2.4)',
    label: 'Spirit of Curato gallery',
  },
  wintrol: {
    transform: 'translate(75%, 29%) scale(2.4)',
    label: 'Wintrol gallery',
  },
  foundation: {
    transform: 'translate(12%, 31%) scale(2.4)',
    label: 'Foundation gallery',
  },
};

/**
 * Category viewports -- zoomed to show all galleries in a category.
 */
export const categoryViewports: Record<CategoryId, MapViewport> = {
  origin: {
    transform: 'translate(34%, -18%) scale(2.08)',
    label: 'Origin galleries',
  },
  businesses: {
    transform: 'translate(52%, 18%) scale(1.6)',
    label: 'Businesses galleries',
  },
  community: {
    transform: 'translate(21%, 33%) scale(2.0)',
    label: 'Culture & Community galleries',
  },
};

/**
 * Per-category card positions for the CategoryInfoPanel.
 */
export const categoryCardPositions: Record<CategoryId, { readonly top: string; readonly left?: string; readonly right?: string }> = {
  origin:       { top: '71%', left: '140px' },
  businesses:   { top: '28%', left: '50px' },
  community:    { top: '13%', right: '17%' },
};

/**
 * Per-gallery card positions for the floating GalleryCard.
 */
export const galleryCardPositions: Record<GalleryId, { readonly top: string; readonly left: string }> = {
  prologue:             { top: '45%', left: '15%' },
  'hilight-experience':   { top: '25%', left: '45%' },
  'people-garden':      { top: '24%', left: '23%' },
  'it-story':           { top: '41%', left: '42%' },
  'consumer-care':      { top: '55%', left: '18%' },
  'factory-experience': { top: '59%', left: '18%' },
  'spirit-of-hilight':    { top: '50%', left: '25%' },
  wintrol:              { top: '45%', left: '26%' },
  foundation:           { top: '60%', left: '42%' },
};

/**
 * "You Are Here" pin marker position on the map.
 * Values are percentages of the SVG viewBox dimensions.
 */
export const youAreHerePosition = { x: 10, y: 50 };
