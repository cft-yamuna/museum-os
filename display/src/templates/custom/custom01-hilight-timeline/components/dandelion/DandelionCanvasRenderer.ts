/**
 * DandelionCanvasRenderer — pre-renders breathing keyframes as offscreen canvases.
 *
 * At startup, renders ~10 frames of the breathing animation to canvas elements.
 * At runtime, draws them onto a visible canvas like a flipbook — zero recalculation.
 */

import { PATHS, SVG_VIEWBOX_W, SVG_ORIGIN_X, SVG_ORIGIN_Y } from './dandelionPaths';

/** Number of keyframes in the breathing cycle */
const FRAME_COUNT = 120;

/** Max scale for breathing (matches original 1.06) */
const BREATH_SCALE = 1.06;

/** Pre-parsed Path2D objects — created once */
let cachedPath2Ds: Path2D[] | null = null;

function getPath2Ds(): Path2D[] {
  if (!cachedPath2Ds) {
    cachedPath2Ds = PATHS.map((d) => new Path2D(d));
  }
  return cachedPath2Ds;
}

/** Per-path random phase offsets — generated once, shared across all dandelions */
let cachedPhases: Float32Array | null = null;
let cachedSpeeds: Float32Array | null = null;

function getPhases(): Float32Array {
  if (!cachedPhases) {
    cachedPhases = new Float32Array(PATHS.length);
    for (let i = 0; i < PATHS.length; i++) {
      cachedPhases[i] = Math.random() * Math.PI * 2;
    }
  }
  return cachedPhases;
}

function getSpeeds(): Float32Array {
  if (!cachedSpeeds) {
    cachedSpeeds = new Float32Array(PATHS.length);
    for (let i = 0; i < PATHS.length; i++) {
      const duration = 1.5 * (0.8 + Math.random() * 0.4);
      cachedSpeeds[i] = (Math.PI * 2) / (duration * 2);
    }
  }
  return cachedSpeeds;
}

/**
 * Render one frame of the breathing animation to a canvas.
 * @param time - simulated time in seconds for this keyframe
 */
function renderFrame(
  ctx: CanvasRenderingContext2D,
  color: string,
  size: number,
  time: number,
  padding: number = 0,
): void {
  const paths = getPath2Ds();
  const phases = getPhases();
  const speeds = getSpeeds();
  const scale = size / SVG_VIEWBOX_W;

  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.save();
  ctx.translate(padding, padding);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;

  for (let i = 0; i < paths.length; i++) {
    const t = Math.sin(time * speeds[i] + phases[i]);
    const s = 1 + (BREATH_SCALE - 1) * (t * 0.5 + 0.5);

    if (Math.abs(s - 1) < 0.002) {
      ctx.fill(paths[i]);
    } else {
      ctx.save();
      ctx.translate(SVG_ORIGIN_X, SVG_ORIGIN_Y);
      ctx.scale(s, s);
      ctx.translate(-SVG_ORIGIN_X, -SVG_ORIGIN_Y);
      ctx.fill(paths[i]);
      ctx.restore();
    }
  }

  ctx.restore();
}

/** Cache by "color|size" */
const framesCache = new Map<string, HTMLCanvasElement[]>();

/**
 * Pre-render all breathing keyframes for a dandelion.
 * Returns an array of canvas elements to draw from.
 */
export function prerenderBreathingFrames(color: string, size: number): HTMLCanvasElement[] {
  const key = `${color}|${size}`;
  const cached = framesCache.get(key);
  if (cached) return cached;

  // Add 10% padding on each side so breathing scale (1.06x) doesn't clip edges
  const padding = Math.ceil(size * 0.1);
  // Use square dimensions to prevent aspect-ratio distortion
  const canvasSize = size + padding * 2;

  // Scale by devicePixelRatio for crisp rendering on HiDPI / 4K screens
  const dpr = window.devicePixelRatio || 1;
  const scaledSize = Math.round(canvasSize * dpr);
  const scaledPadding = Math.round(padding * dpr);
  const scaledRenderSize = Math.round(size * dpr);

  // The breathing cycle duration — spread frames evenly across one full cycle
  // Use ~3 seconds as the base cycle (matches the original animation feel)
  const cycleDuration = 3;
  const frames: HTMLCanvasElement[] = [];

  for (let f = 0; f < FRAME_COUNT; f++) {
    const canvas = document.createElement('canvas');
    canvas.width = scaledSize;
    canvas.height = scaledSize;
    const ctx = canvas.getContext('2d')!;
    const time = (f / FRAME_COUNT) * cycleDuration;
    renderFrame(ctx, color, scaledRenderSize, time, scaledPadding);
    frames.push(canvas);
  }

  framesCache.set(key, frames);
  return frames;
}
