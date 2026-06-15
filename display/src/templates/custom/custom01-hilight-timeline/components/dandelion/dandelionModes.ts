/**
 * Animation mode definitions for the dandelion tuning page.
 * Each mode defines its tunable parameters and an apply function
 * that creates GSAP animations on individual SVG path elements.
 */

import gsap from 'gsap';

const SVG_ORIGIN = '74 72';

export interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface AnimationModeDef {
  id: string;
  label: string;
  params: ParamDef[];
  /** Apply animation to paths. Returns a cleanup function. */
  apply: (paths: Element[], values: Record<string, number>) => () => void;
}

function killAll(items: gsap.core.Animation[]) {
  items.forEach((t) => t.kill());
}

export const MODES: AnimationModeDef[] = [
  // ── 1. Breathing ──────────────────────────────────────────
  {
    id: 'breathing',
    label: 'Breathing',
    params: [
      { key: 'scale', label: 'Scale', min: 1.01, max: 1.3, step: 0.01, default: 1.05 },
      { key: 'duration', label: 'Duration (s)', min: 1, max: 6, step: 0.5, default: 3 },
      { key: 'delaySpread', label: 'Delay Spread (s)', min: 0, max: 5, step: 0.5, default: 3 },
    ],
    apply(paths, { scale, duration, delaySpread }) {
      const tweens = paths.map((path) =>
        gsap.to(path, {
          scale,
          svgOrigin: SVG_ORIGIN,
          duration: duration * (0.8 + Math.random() * 0.4),
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
          delay: Math.random() * delaySpread,
        }),
      );
      return () => killAll(tweens);
    },
  },

  // ── 2. Wave Ripple ────────────────────────────────────────
  {
    id: 'waveRipple',
    label: 'Wave Ripple',
    params: [
      { key: 'scale', label: 'Scale', min: 1.01, max: 1.3, step: 0.01, default: 1.08 },
      { key: 'speed', label: 'Wave Speed (s)', min: 1, max: 8, step: 0.5, default: 3 },
    ],
    apply(paths, { scale, speed }) {
      const tweens = paths.map((path, i) =>
        gsap.to(path, {
          scale,
          svgOrigin: SVG_ORIGIN,
          duration: speed * 0.3,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
          repeatDelay: speed * 0.7,
          delay: (i / paths.length) * speed,
        }),
      );
      return () => killAll(tweens);
    },
  },

  // ── 5. Shimmer ────────────────────────────────────────────
  {
    id: 'shimmer',
    label: 'Shimmer',
    params: [
      { key: 'minOpacity', label: 'Min Opacity', min: 0.1, max: 0.9, step: 0.05, default: 0.3 },
      { key: 'speed', label: 'Speed (s)', min: 0.5, max: 4, step: 0.25, default: 1.5 },
      { key: 'delaySpread', label: 'Delay Spread (s)', min: 0, max: 3, step: 0.25, default: 2 },
    ],
    apply(paths, { minOpacity, speed, delaySpread }) {
      const tweens = paths.map((path) =>
        gsap.to(path, {
          opacity: minOpacity,
          duration: speed * (0.7 + Math.random() * 0.6),
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
          delay: Math.random() * delaySpread,
        }),
      );
      return () => killAll(tweens);
    },
  },

];
