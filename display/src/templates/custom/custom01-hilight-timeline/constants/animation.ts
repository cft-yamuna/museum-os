export const ANIMATION = {
  floatingDandelion: {
    // Wander — dreamy, languid drift to random positions (real seeds: ~0.4 m/s)
    wander: {
      durationRange: [18, 35] as const,
      distanceRange: [150, 400] as const,
      ease: 'power1.inOut',
    },
    // Gentle sway — smooth, slow oscillation overlaid on the wander path
    sway: {
      xRange: [20, 40] as const,
      yRange: [15, 30] as const,
      durationRange: [6, 10] as const,
    },
    // Slow continuous spin — SVG only, text stays upright
    rotation: {
      durationRange: [25, 90] as const, // seconds per full revolution
    },
    // 3D depth — subtle scale shift (closer = slightly bigger)
    depth: {
      scaleRange: [0.8, 1.5] as const,
    },
  },

  ambientTitle: {
    breatheDuration: 4,
    opacityRange: [0.7, 1] as const,
    ease: 'sine.inOut',
  },

  backgroundGradient: {
    shiftDuration: 20,
    ease: 'sine.inOut',
  },
  sectorTransition: {
    dandelionMove: { duration: 1.6, ease: 'power2.inOut', targetY: 230 },
    fadeOthers: { duration: 0.5, targetOpacity: 0.15, stagger: 0.05 },
    titleFade: { duration: 0.4 },
    colorGradient: { duration: 0.6 },
    timeline: {
      entryDuration: 0.9,
      entryStagger: 0.3,
      entryDelay: 1.2,
      lineDraw: 2.0,
    },
    reverse: {
      fadeOutDuration: 0.3,
      moveBackDelay: 0.3,
    },
  },
} as const;

/** Fixed visual size (px) for any dandelion when centered after click. */
export const CENTERED_DANDELION_SIZE = 400;

/** Layout for View All mode — 3 dandelions side by side at the top. */
export const VIEWALL_LAYOUT = {
  dandelionSize: 380,
  count: 3,
  /** X-centers for the 3 dandelions within the 1080px canvas */
  xPositions: [200, 540, 880],
  /** Top offset for carousel dandelion placement */
  topOffset: 60,
  /** Max dandelion size in carousel (used for vertical centering) */
  maxSize: 380,
  /** Duration for carousel shift animation */
  shiftDuration: 0.5,
  /** Ease for carousel shift animation */
  shiftEase: 'power2.inOut',
} as const;

/** Returns a random number between min and max (inclusive). */
export function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
