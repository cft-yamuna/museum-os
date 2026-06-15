/**
 * FloatingDandelion — a single dandelion that drifts like a real seed in air.
 *
 * Based on dandelion seed physics:
 *  - Terminal velocity ~0.39 m/s — extremely slow, dreamy movement
 *  - Porous pappus creates steady, smooth flight (minimal wobble)
 *  - Carried passively by air currents — languid, weightless
 *
 * Motion system:
 *  - Wander loop: very slow drift to random positions (18-35s per leg)
 *  - Gentle sway: smooth, slow sine-wave oscillation overlaid on path
 *  - Subtle rotation: barely perceptible tumble
 *  - 3D depth: gentle scale + opacity coupling
 */

import { useRef, forwardRef, useImperativeHandle, useEffect } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import DandelionSimplified from './DandelionSimplified';
// import { MODES } from './dandelionModes'; // strand animation disabled for perf
import { ANIMATION, randomInRange } from '../../constants/animation';
import type { DandelionHandle } from '../../types';

// Canvas bounds (1080x1920 portrait)
const CANVAS_W = 1080;
const CANVAS_H = 1920;
const PAD = 40;


interface FloatingDandelionProps {
  color: string;
  glowColor: string;
  size: number;
  x: number;
  y: number;
  delay?: number;
  label: string;
  labelScale?: number;
  getOtherPositions?: () => { cx: number; cy: number }[];
  onClick?: () => void;
  dimmed?: boolean;
  /** Whether the label text is visible (animates opacity). Defaults to true. */
  showLabel?: boolean;
  /** Animation mode for strand animation (breathing, waveRipple, shimmer). */
  animationMode?: string;
  /** Parameters for the selected animation mode. */
  animationParams?: Record<string, number>;
  /** Min depth scale (default 0.8). */
  scaleMin?: number;
  /** Max depth scale (default 1.5). */
  scaleMax?: number;
}

function depthToOpacity(scale: number, minScale: number, maxScale: number): number {
  const t = (scale - minScale) / (maxScale - minScale);
  return 0.7 + t * 0.25;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/** Number of candidate targets to evaluate */
const CANDIDATE_COUNT = 6;

/** Pick a wander target that stays away from other dandelions.
 *  Generates several random candidates and picks the one with the
 *  best minimum distance to all other dandelion centers. */
function pickWanderTarget(
  currentLeft: number,
  currentTop: number,
  dandelionSize: number,
  minDist: number,
  maxDist: number,
  others?: { cx: number; cy: number }[],
): { left: number; top: number } {
  const generateCandidate = () => {
    const angle = Math.random() * Math.PI * 2;
    const distance = randomInRange(minDist, maxDist);
    return {
      left: clamp(
        currentLeft + Math.cos(angle) * distance,
        PAD,
        CANVAS_W - dandelionSize - PAD,
      ),
      top: clamp(
        currentTop + Math.sin(angle) * distance,
        PAD,
        CANVAS_H - dandelionSize - PAD,
      ),
    };
  };

  if (!others || others.length === 0) return generateCandidate();

  let bestCandidate = generateCandidate();
  let bestMinDist = 0;

  for (let i = 0; i < CANDIDATE_COUNT; i++) {
    const candidate = generateCandidate();
    const candidateCx = candidate.left + dandelionSize / 2;
    const candidateCy = candidate.top + dandelionSize / 2;

    // Find the closest other dandelion to this candidate
    let closestDist = Infinity;
    for (const o of others) {
      const dx = candidateCx - o.cx;
      const dy = candidateCy - o.cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) closestDist = dist;
    }

    if (closestDist > bestMinDist) {
      bestMinDist = closestDist;
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
}

const FloatingDandelion = forwardRef<DandelionHandle, FloatingDandelionProps>(
  function FloatingDandelion(
    { color, glowColor, size, x, y, delay = 0, label, labelScale = 1, getOtherPositions, onClick, dimmed, showLabel = true, animationMode: _animationMode, animationParams: _animationParams, scaleMin: propScaleMin, scaleMax: propScaleMax },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const svgWrapperRef = useRef<HTMLDivElement>(null);
    const tweensRef = useRef<gsap.core.Tween[]>([]);
    const rotationTweenRef = useRef<gsap.core.Tween | null>(null);
    const dimTweenRef = useRef<gsap.core.Tween | null>(null);
    const wanderActiveRef = useRef(false);
    // const breathingTweensRef = useRef<gsap.core.Tween[]>([]);

    const createTweens = (isRestart = false) => {
      const el = containerRef.current;
      if (!el) return;

      // Kill movement tweens
      wanderActiveRef.current = false;
      tweensRef.current.forEach((t) => t.kill());
      tweensRef.current = [];

      const cfg = ANIMATION.floatingDandelion;
      const minScale = propScaleMin ?? cfg.depth.scaleRange[0];
      const maxScale = propScaleMax ?? cfg.depth.scaleRange[1];
      const svgEl = svgWrapperRef.current;

      // On first mount: set random scale + rotation. On restart: keep current values.
      const tweenDelay = isRestart ? 0 : delay;
      if (!isRestart) {
        gsap.set(el, { scale: randomInRange(minScale + 0.05, maxScale - 0.05) });
        if (svgEl) gsap.set(svgEl, { rotation: randomInRange(0, 360) });
      }

      // ── Gentle sway overlays (smooth, slow sine waves) ──
      tweensRef.current.push(
        gsap.to(el, {
          x: `+=${randomInRange(cfg.sway.xRange[0], cfg.sway.xRange[1])}`,
          duration: randomInRange(cfg.sway.durationRange[0], cfg.sway.durationRange[1]),
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
          repeatRefresh: true,
          delay: tweenDelay,
        }),
        gsap.to(el, {
          y: `+=${randomInRange(cfg.sway.yRange[0], cfg.sway.yRange[1])}`,
          duration: randomInRange(cfg.sway.durationRange[0], cfg.sway.durationRange[1]) * 1.3,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
          repeatRefresh: true,
          delay: tweenDelay,
        }),
      );

      // ── Continuous SVG-only rotation (text stays upright) ──
      // On restart, keep existing rotation tween if still alive
      if (!isRestart || !rotationTweenRef.current) {
        rotationTweenRef.current?.kill();
        if (svgEl) {
          const direction = Math.random() > 0.5 ? 360 : -360;
          rotationTweenRef.current = gsap.to(svgEl, {
            rotation: `+=${direction}`,
            duration: randomInRange(cfg.rotation.durationRange[0], cfg.rotation.durationRange[1]),
            ease: 'none',
            repeat: -1,
            delay: tweenDelay,
          });
        }
      }

      // ── Wander loop (slow, dreamy position traversal) ──
      wanderActiveRef.current = true;

      const wanderStep = () => {
        if (!wanderActiveRef.current) return;

        const currentLeft = parseFloat(el.style.left) || x;
        const currentTop = parseFloat(el.style.top) || y;
        const others = getOtherPositions?.();
        const target = pickWanderTarget(
          currentLeft,
          currentTop,
          size,
          cfg.wander.distanceRange[0],
          cfg.wander.distanceRange[1],
          others,
        );
        const targetScale = randomInRange(minScale, maxScale);
        const duration = randomInRange(cfg.wander.durationRange[0], cfg.wander.durationRange[1]);

        const tween = gsap.to(el, {
          left: target.left,
          top: target.top,
          scale: targetScale,
          duration,
          ease: cfg.wander.ease,
          onUpdate() {
            if (!dimTweenRef.current) {
              const s = gsap.getProperty(el, 'scale') as number;
              el.style.opacity = String(depthToOpacity(s, minScale, maxScale));
            }
          },
          onComplete: wanderStep,
        });

        tweensRef.current.push(tween);
      };

      // Start wandering after delay
      gsap.delayedCall(tweenDelay, wanderStep);
    };

    useGSAP(() => {
      createTweens(false);
    }, { scope: containerRef });

    // ── Strand animation disabled for performance on Intel iGPU ──
    // 359 paths × 7 dandelions = 2500+ individual GSAP tweens overwhelms Intel UHD
    // TODO: re-enable with canvas-based rendering approach
    // useEffect(() => {
    //   const container = containerRef.current;
    //   if (!container) return;
    //   const paths = Array.from(container.querySelectorAll('svg g path'));
    //   if (!paths.length) return;
    //   const modeId = animationMode || 'breathing';
    //   const modeDef = MODES.find((m) => m.id === modeId) || MODES[0];
    //   const values: Record<string, number> = {};
    //   for (const p of modeDef.params) {
    //     values[p.key] = animationParams?.[p.key] ?? p.default;
    //   }
    //   const cleanup = modeDef.apply(paths, values);
    //   breathingTweensRef.current = [];
    //   return () => { cleanup(); breathingTweensRef.current = []; };
    // }, [animationMode, animationParams]);

    useImperativeHandle(ref, () => ({
      getContainer: () => containerRef.current,
      killTweens: () => {
        wanderActiveRef.current = false;
        tweensRef.current.forEach((t) => t.kill());
        tweensRef.current = [];
        // Rotation tween intentionally NOT killed — keeps spinning in sector view
      },
      restartTweens: () => {
        createTweens(true);
      },
    }));

    // Dimmed visibility effect — AmbientScene controls ViewAll visibility imperatively
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      dimTweenRef.current?.kill();

      const targetOpacity = dimmed
        ? ANIMATION.sectorTransition.fadeOthers.targetOpacity
        : 0.85;
      dimTweenRef.current = gsap.to(el, {
        opacity: targetOpacity,
        duration: ANIMATION.sectorTransition.fadeOthers.duration,
        ease: 'power2.out',
        onComplete: () => { dimTweenRef.current = null; },
      });

      return () => {
        dimTweenRef.current?.kill();
        dimTweenRef.current = null;
      };
    }, [dimmed]);

    return (
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: size,
          height: size,
          opacity: 0.85,
          // filter: `drop-shadow(0 0 ${size * 0.08}px ${glowColor})`, // disabled for perf
          willChange: 'transform, opacity',
          pointerEvents: 'none',
        }}
        aria-label={label}
      >
        <div
          ref={svgWrapperRef}
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            top: 0,
            left: 0,
            pointerEvents: 'none',
          }}
        >
          <DandelionSimplified color={color} size={size} />
        </div>
        {label && (
          <span
            onClick={onClick}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              fontFamily: "'Arial', 'Helvetica Neue', sans-serif",
              fontSize: Math.max(36, size * 0.12) * labelScale,
              fontWeight: 700,
              color: '#fff',
              textShadow: `0 1px 4px rgba(0,0,0,0.4), 0 0 8px ${glowColor}`,
              whiteSpace: 'pre-line',
              textAlign: 'center',
              lineHeight: 1.25,
              pointerEvents: onClick && showLabel ? 'auto' : 'none',
              letterSpacing: '0.02em',
              opacity: showLabel ? 1 : 0,
              transition: 'opacity 0.5s ease',
              cursor: onClick ? 'pointer' : 'default',
              padding: '12px 20px',
              zIndex: 2,
            }}
          >
            {label}
          </span>
        )}
      </div>
    );
  },
);

export default FloatingDandelion;
