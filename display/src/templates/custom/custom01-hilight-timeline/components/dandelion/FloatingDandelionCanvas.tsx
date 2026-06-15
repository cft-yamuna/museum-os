/**
 * FloatingDandelionCanvas — canvas-rasterized drop-in replacement for FloatingDandelion.
 *
 * The dandelion SVG is rasterized to a PNG bitmap once at mount.
 * All animations (float, sway, rotate, wander) use GSAP on DOM containers.
 * Breathing is a single scale tween on the <img>, not 359 individual path tweens.
 * Glow is a CSS drop-shadow on the container (same as original).
 */

import { useRef, forwardRef, useImperativeHandle, useEffect, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { prerenderBreathingFrames } from './DandelionCanvasRenderer';
import { ANIMATION, randomInRange } from '../../constants/animation';
import type { DandelionHandle } from '../../types';

const CANVAS_W = 1080;
const CANVAS_H = 1920;
const PAD = 40;

interface FloatingDandelionCanvasProps {
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
  showLabel?: boolean;
  clickable?: boolean;
}

function depthToOpacity(scale: number, minScale: number, maxScale: number): number {
  const t = (scale - minScale) / (maxScale - minScale);
  return 0.7 + t * 0.25;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

const CANDIDATE_COUNT = 6;

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
      left: clamp(currentLeft + Math.cos(angle) * distance, PAD, CANVAS_W - dandelionSize - PAD),
      top: clamp(currentTop + Math.sin(angle) * distance, PAD, CANVAS_H - dandelionSize - PAD),
    };
  };

  if (!others || others.length === 0) return generateCandidate();

  let bestCandidate = generateCandidate();
  let bestMinDist = 0;

  for (let i = 0; i < CANDIDATE_COUNT; i++) {
    const candidate = generateCandidate();
    const candidateCx = candidate.left + dandelionSize / 2;
    const candidateCy = candidate.top + dandelionSize / 2;

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

const FloatingDandelionCanvas = forwardRef<DandelionHandle, FloatingDandelionCanvasProps>(
  function FloatingDandelionCanvas(
    { color, glowColor, size, x, y, delay = 0, label, labelScale = 1, getOtherPositions, onClick, dimmed, showLabel = true },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const imgWrapperRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const tweensRef = useRef<gsap.core.Tween[]>([]);
    const rotationTweenRef = useRef<gsap.core.Tween | null>(null);
    const dimTweenRef = useRef<gsap.core.Tween | null>(null);
    const wanderActiveRef = useRef(false);
    const breathingIntervalRef = useRef<number>(0);
    const waveRafRef = useRef<number>(0);
    const waveRunningRef = useRef(false);

    // Random phase offsets — unique per dandelion instance, stable across renders
    const [wavePhases] = useState(() => ({
      p1: Math.random() * Math.PI * 2,
      p2: Math.random() * Math.PI * 2,
      p3: Math.random() * Math.PI * 2,
      p4: Math.random() * Math.PI * 2,
      p5: Math.random() * Math.PI * 2,
      p6: Math.random() * Math.PI * 2,
    }));

    // Pre-render all breathing keyframes once
    const [frames] = useState(() => prerenderBreathingFrames(color, size));
    const frameIndexRef = useRef(0);

    const createTweens = (isRestart = false) => {
      const el = containerRef.current;
      if (!el) return;

      wanderActiveRef.current = false;
      waveRunningRef.current = false;
      cancelAnimationFrame(waveRafRef.current);
      tweensRef.current.forEach((t) => t.kill());
      tweensRef.current = [];

      const cfg = ANIMATION.floatingDandelion;
      const minScale = cfg.depth.scaleRange[0];
      const maxScale = cfg.depth.scaleRange[1];
      const wrapperEl = imgWrapperRef.current;

      const tweenDelay = isRestart ? 0 : delay;
      if (!isRestart) {
        gsap.set(el, { scale: randomInRange(minScale + 0.05, maxScale - 0.05) });
        if (wrapperEl) gsap.set(wrapperEl, { rotation: randomInRange(0, 360) });
      }

      // ── Compound wave motion — organic water-like drift ──
      // (To revert to simple sway, uncomment the block below and comment out the wave code)
      //
      // tweensRef.current.push(
      //   gsap.to(el, {
      //     x: `+=${randomInRange(cfg.sway.xRange[0], cfg.sway.xRange[1])}`,
      //     duration: randomInRange(cfg.sway.durationRange[0], cfg.sway.durationRange[1]),
      //     ease: 'sine.inOut', repeat: -1, yoyo: true, repeatRefresh: true, delay: tweenDelay,
      //   }),
      //   gsap.to(el, {
      //     y: `+=${randomInRange(cfg.sway.yRange[0], cfg.sway.yRange[1])}`,
      //     duration: randomInRange(cfg.sway.durationRange[0], cfg.sway.durationRange[1]) * 1.3,
      //     ease: 'sine.inOut', repeat: -1, yoyo: true, repeatRefresh: true, delay: tweenDelay,
      //   }),
      // );

      // Compound wave: primary current + cross-current + surface ripple
      // Each layer has different speed and amplitude for organic feel
      const PRIMARY_AMP_X = 35;     // Main current X (px)           [range: 15–60]
      const PRIMARY_AMP_Y = 25;     // Main current Y (px)           [range: 10–50]
      const PRIMARY_PERIOD = 11;    // Slow drift cycle (sec)        [range: 8–16]

      const SECONDARY_AMP_X = 15;   // Cross-current X (px)          [range: 8–25]
      const SECONDARY_AMP_Y = 12;   // Cross-current Y (px)          [range: 6–20]
      const SECONDARY_PERIOD = 4.5; // Medium cycle (sec)            [range: 3–7]

      const RIPPLE_AMP_X = 5;       // Surface turbulence X (px)     [range: 2–10]
      const RIPPLE_AMP_Y = 4;       // Surface turbulence Y (px)     [range: 2–8]
      const RIPPLE_PERIOD = 1.8;    // Fast jitter cycle (sec)       [range: 1–3]

      waveRunningRef.current = true;
      const waveStartTime = performance.now() / 1000;
      const { p1, p2, p3, p4, p5, p6 } = wavePhases;

      const FADE_IN = 4; // seconds to ramp wave from 0 to full amplitude

      const waveTick = () => {
        if (!waveRunningRef.current) return;
        const t = performance.now() / 1000 - waveStartTime;

        // Smooth fade-in: 0 → 1 over FADE_IN seconds (ease-in curve)
        const fade = Math.min(1, t / FADE_IN);
        const amp = fade * fade; // quadratic ease-in for extra softness

        const wx = amp * (
          PRIMARY_AMP_X * Math.sin(t * (Math.PI * 2 / PRIMARY_PERIOD) + p1)
          + SECONDARY_AMP_X * Math.sin(t * (Math.PI * 2 / SECONDARY_PERIOD) + p2)
          + RIPPLE_AMP_X * Math.sin(t * (Math.PI * 2 / RIPPLE_PERIOD) + p3)
        );

        const wy = amp * (
          PRIMARY_AMP_Y * Math.cos(t * (Math.PI * 2 / PRIMARY_PERIOD) + p4)
          + SECONDARY_AMP_Y * Math.cos(t * (Math.PI * 2 / SECONDARY_PERIOD) + p5)
          + RIPPLE_AMP_Y * Math.sin(t * (Math.PI * 2 / RIPPLE_PERIOD) + p6)
        );

        gsap.set(el, { x: wx, y: wy });
        waveRafRef.current = requestAnimationFrame(waveTick);
      };

      if (tweenDelay > 0) {
        gsap.delayedCall(tweenDelay, () => {
          if (waveRunningRef.current) waveTick();
        });
      } else {
        waveRafRef.current = requestAnimationFrame(waveTick);
      }

      // Continuous rotation
      if (!isRestart || !rotationTweenRef.current) {
        rotationTweenRef.current?.kill();
        if (wrapperEl) {
          const direction = Math.random() > 0.5 ? 360 : -360;
          rotationTweenRef.current = gsap.to(wrapperEl, {
            rotation: `+=${direction}`,
            duration: randomInRange(cfg.rotation.durationRange[0], cfg.rotation.durationRange[1]),
            ease: 'none',
            repeat: -1,
            delay: tweenDelay,
          });
        }
      }

      // Wander loop
      wanderActiveRef.current = true;

      const wanderStep = () => {
        if (!wanderActiveRef.current) return;

        const currentLeft = parseFloat(el.style.left) || x;
        const currentTop = parseFloat(el.style.top) || y;
        const others = getOtherPositions?.();
        const target = pickWanderTarget(
          currentLeft, currentTop, size,
          cfg.wander.distanceRange[0], cfg.wander.distanceRange[1],
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

      gsap.delayedCall(tweenDelay, wanderStep);
    };

    useGSAP(() => {
      createTweens(false);
    }, { scope: containerRef });

    // Draw a specific frame onto the visible canvas
    const drawFrame = (index: number) => {
      const canvas = canvasRef.current;
      if (!canvas || frames.length === 0) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(frames[index], 0, 0);
    };

    // Draw initial frame on mount
    useEffect(() => {
      if (frames.length > 0) drawFrame(frameIndexRef.current);
    }, [frames]);

    // Breathing: cycle through pre-rendered keyframes like a flipbook
    useEffect(() => {
      if (!canvasRef.current || frames.length === 0) return;

      // Cycle at ~5fps (200ms per frame) — slow enough to look like gentle breathing
      // With 10 frames over a 3s cycle, 200ms/frame ≈ 2s per full cycle + reverse
      let forward = true;
      const startOffset = Math.floor(Math.random() * frames.length);
      frameIndexRef.current = startOffset;

      breathingIntervalRef.current = window.setInterval(() => {
        if (forward) {
          frameIndexRef.current++;
          if (frameIndexRef.current >= frames.length - 1) forward = false;
        } else {
          frameIndexRef.current--;
          if (frameIndexRef.current <= 0) forward = true;
        }
        drawFrame(frameIndexRef.current);
      }, 33);

      return () => {
        clearInterval(breathingIntervalRef.current);
      };
    }, [frames]);

    useImperativeHandle(ref, () => ({
      getContainer: () => containerRef.current,
      killTweens: () => {
        wanderActiveRef.current = false;
        waveRunningRef.current = false;
        cancelAnimationFrame(waveRafRef.current);
        tweensRef.current.forEach((t) => t.kill());
        tweensRef.current = [];
      },
      restartTweens: () => {
        createTweens(true);
      },
    }));

    // Dimmed visibility
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
          zIndex: Math.round(1000 - size),
          opacity: 0.85,
          // filter: `drop-shadow(0 0 ${size * 0.08}px ${glowColor})`, // disabled for perf testing
          willChange: 'transform, opacity',
          pointerEvents: 'none',
        }}
        aria-label={label}
      >
        <div
          ref={imgWrapperRef}
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            top: 0,
            left: 0,
            pointerEvents: 'none',
          }}
        >
          <canvas
            ref={canvasRef}
            width={Math.round((size + 2 * Math.ceil(size * 0.1)) * (window.devicePixelRatio || 1))}
            height={Math.round((size + 2 * Math.ceil(size * 0.1)) * (window.devicePixelRatio || 1))}
            style={{
              display: 'block',
              position: 'absolute',
              left: -(size * 0.1),
              top: -(size * 0.1),
              width: size * 1.2,
              height: size * 1.2,
              pointerEvents: 'none',
            }}
          />
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
              cursor: onClick ? 'pointer' : 'default',
              letterSpacing: '0.02em',
              padding: '12px 8px',
              opacity: showLabel ? 1 : 0,
              transition: 'opacity 0.5s ease',
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

export default FloatingDandelionCanvas;
