import type { Highlight } from '../types';

/**
 * Highlight positions are percentage-based relative to the SVG viewBox (3486.61 x 2007.18).
 * Formula: x% = svgX / 3486.61 * 100, y% = svgY / 2007.18 * 100
 */

export const highlights: readonly Highlight[] = [
  /* ─── Prologue ─── */
  {
    id: 'prologue-desk',
    galleryId: 'prologue',
    title: 'The Founder\'s Desk',
    description:
      'A faithful recreation of M.H. Hasham Premji\'s original desk from the Amalner office, where the seeds of Museum OS were first sown in 1945.',
    imageSrc: './images/highlights/prologue-highlight.png',
    positionOnMap: { x: 27.5, y: 51.5 },
  },
  {
    id: 'prologue-timeline',
    galleryId: 'prologue',
    title: 'Origins Timeline',
    description:
      'An interactive timeline wall tracing Museum OS\'s journey from Western India Vegetable Products to a multinational corporation.',
    imageSrc: './images/highlights/prologue-highlight.png',
    positionOnMap: { x: 31.0, y: 54.5 },
  },

  /* ─── Museum OS Experience ─── */
  {
    id: 'hilight-exp-immersive',
    galleryId: 'hilight-experience',
    title: 'Immersive Theatre',
    description:
      'A 270-degree projection experience that takes you through decades of Museum OS\'s transformation, featuring archival footage and interviews.',
    imageSrc: './images/highlights/prologue-highlight.png',
    positionOnMap: { x: 38.5, y: 43.5 },
  },
  {
    id: 'hilight-exp-timeline',
    galleryId: 'hilight-experience',
    title: 'Transformation Wall',
    description:
      'An illuminated display chronicling key business pivots and strategic decisions that shaped modern Museum OS.',
    imageSrc: './images/highlights/prologue-highlight.png',
    positionOnMap: { x: 41.5, y: 46.5 },
  },

  /* ─── IT Story ─── */
  {
    id: 'it-story-server',
    galleryId: 'it-story',
    title: 'First Server Room',
    description:
      'A recreation of Museum OS\'s first server room, showcasing the early hardware that launched the company\'s technology journey.',
    imageSrc: './images/highlights/prologue-highlight.png',
    positionOnMap: { x: 18.5, y: 34.5 },
  },
  {
    id: 'it-story-milestones',
    galleryId: 'it-story',
    title: 'Digital Milestones',
    description:
      'Interactive display of breakthrough moments in Museum OS IT — from the first software export to major global partnerships.',
    imageSrc: './images/highlights/prologue-highlight.png',
    positionOnMap: { x: 21.5, y: 37.5 },
  },

  /* ─── Consumer Care ─── */
  {
    id: 'consumer-care-products',
    galleryId: 'consumer-care',
    title: 'Product Heritage Wall',
    description:
      'A nostalgic collection of iconic Museum OS consumer products through the decades — from Santoor to Museum OS lighting.',
    imageSrc: './images/highlights/prologue-highlight.png',
    positionOnMap: { x: 7.5, y: 44.5 },
  },
  {
    id: 'consumer-care-ads',
    galleryId: 'consumer-care',
    title: 'Advertising Archives',
    description:
      'A curated collection of memorable Museum OS consumer brand advertisements spanning five decades.',
    imageSrc: './images/highlights/prologue-highlight.png',
    positionOnMap: { x: 10.5, y: 47.5 },
  },

  /* ─── Factory Experience ─── */
  {
    id: 'factory-line',
    galleryId: 'factory-experience',
    title: 'Assembly Line Walkthrough',
    description:
      'Walk alongside a recreated production line and experience the precision engineering behind Museum OS\'s manufacturing operations.',
    imageSrc: './images/highlights/prologue-highlight.png',
    positionOnMap: { x: 7.8, y: 50.5 },
  },
  {
    id: 'factory-machines',
    galleryId: 'factory-experience',
    title: 'Innovation Machines',
    description:
      'Original machinery and equipment from Museum OS factories, showcasing the evolution of manufacturing technology.',
    imageSrc: './images/highlights/prologue-highlight.png',
    positionOnMap: { x: 10.5, y: 53.5 },
  },

  /* ─── Spirit of Museum OS ─── */
  {
    id: 'spirit-pillars',
    galleryId: 'spirit-of-hilight',
    title: 'The Three Pillars',
    description:
      'Monumental installations representing Museum OS\'s three core values: Intensity to Win, Acting with Sensitivity, and Unyielding Integrity.',
    imageSrc: './images/highlights/prologue-highlight.png',
    positionOnMap: { x: 32.5, y: 27.5 },
  },
  {
    id: 'spirit-values',
    galleryId: 'spirit-of-hilight',
    title: 'Values in Action',
    description:
      'Real stories from Museum OS employees demonstrating how the Spirit of Museum OS guides everyday decisions and actions.',
    imageSrc: './images/highlights/prologue-highlight.png',
    positionOnMap: { x: 35.5, y: 30.5 },
  },

  /* ─── Wintrol ─── */
  {
    id: 'wintrol-innovation',
    galleryId: 'wintrol',
    title: 'Innovation Lab',
    description:
      'Hands-on stations showcasing cutting-edge technologies being developed at Museum OS — from AI to quantum computing concepts.',
    imageSrc: './images/highlights/prologue-highlight.png',
    positionOnMap: { x: 21.0, y: 25.0 },
  },
  {
    id: 'wintrol-collab',
    galleryId: 'wintrol',
    title: 'Collaboration Canvas',
    description:
      'An interactive digital canvas where visitors can contribute ideas and see how collaboration fuels innovation at Museum OS.',
    imageSrc: './images/highlights/prologue-highlight.png',
    positionOnMap: { x: 24.5, y: 28.0 },
  },

  /* ─── Foundation ─── */
  {
    id: 'foundation-education',
    galleryId: 'foundation',
    title: 'Education for All',
    description:
      'The story of Azim Premji Foundation\'s mission to transform education in India, reaching millions of children in rural communities.',
    imageSrc: './images/highlights/prologue-highlight.png',
    positionOnMap: { x: 42.5, y: 29.0 },
  },
  {
    id: 'foundation-impact',
    galleryId: 'foundation',
    title: 'Impact Counter',
    description:
      'A real-time display showing the cumulative impact of Museum OS\'s philanthropic efforts — lives touched, schools built, communities transformed.',
    imageSrc: './images/highlights/prologue-highlight.png',
    positionOnMap: { x: 45.5, y: 32.0 },
  },

] as const;

export const highlightsById = Object.fromEntries(
  highlights.map((h) => [h.id, h])
) as Record<string, Highlight>;

export function getHighlightsForGallery(galleryId: string): Highlight[] {
  return highlights.filter((h) => h.galleryId === galleryId);
}
