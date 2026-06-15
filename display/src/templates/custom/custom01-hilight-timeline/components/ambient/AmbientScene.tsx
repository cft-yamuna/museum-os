import { useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import gsap from 'gsap';
import FloatingDandelionSVG from '../dandelion/FloatingDandelion';
import FloatingDandelionCanvas from '../dandelion/FloatingDandelionCanvas';

// Toggle: use canvas-based rendering for performance on Intel GPUs
const USE_CANVAS = true;
const FloatingDandelion = USE_CANVAS ? FloatingDandelionCanvas : FloatingDandelionSVG;
import { useTimelineData } from '../../context/TimelineDataContext';
import { ANIMATION, CENTERED_DANDELION_SIZE } from '../../constants/animation';
import { Sector } from '../../types';
import type { AppState, DandelionHandle, SectorConfig } from '../../types';

export interface AmbientSceneHandle {
  getSelectedContainer: () => HTMLDivElement | null;
}

// ── Decorative (ambient-only) dandelion generation ──

/** Mulberry32 seeded PRNG — stable positions across renders */
function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DECORATIVE_COLOR = '#aaaaaa';
const DECORATIVE_GLOW = 'rgba(170, 170, 170, 0.25)';

const DECORATIVE_SIZES = [480, 160, 340, 190, 420, 150, 300, 130];

function generateDecorativeDandelions() {
  const rng = mulberry32(12345);
  const cols = 2;
  const rows = 4;
  const cellW = 1080 / cols;
  const cellH = 1920 / rows;

  return DECORATIVE_SIZES.map((size, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const jitterX = (rng() - 0.5) * (cellW - size) * 0.6;
    const jitterY = (rng() - 0.5) * (cellH - size) * 0.6;
    const cx = col * cellW + cellW / 2 + jitterX;
    const cy = row * cellH + cellH / 2 + jitterY;
    return {
      color: DECORATIVE_COLOR,
      glowColor: DECORATIVE_GLOW,
      size,
      x: Math.round(Math.max(0, Math.min(1080 - size, cx - size / 2))),
      y: Math.round(Math.max(0, Math.min(1920 - size, cy - size / 2))),
      delay: rng() * 4,
    };
  });
}

const DECORATIVE_DANDELIONS = generateDecorativeDandelions();

// ── Cluster positions for "active" state ──
// Hand-tuned (top-left) targets that pack dandelions near screen center.
// Order matches DEFAULT_DANDELIONS: Sustainability, ConsumerCare, WiN, Foundation, General
// Positions: center % → top-left px on 1080x1920 canvas
const CLUSTER_POSITIONS = [
  { x: 80,  y: 520 },   // Sustainability (380px) — center 25%, 37%
  { x: 191, y: 795 },   // ConsumerCare (330px) — center 33%, 50%
  { x: 655, y: 574 },   // WiN (310px) — center 75%, 38%
  { x: 573, y: 781 },   // Foundation (280px) — center 66%, 48%
  { x: 270, y: 363 },   // General (540px) — center 50%, 33%
];

const CLUSTER_IN_DURATION = 2.4;
const CLUSTER_OUT_DURATION = 1.4;
const CLUSTER_EASE = 'sine.inOut';

// ── Component ──

interface AmbientSceneProps {
  appState: AppState;
  selectedSector?: SectorConfig | null;
  selectedIndex?: number | null;
  onSelectSector?: (sector: SectorConfig, index: number) => void;
}

const AmbientScene = forwardRef<AmbientSceneHandle, AmbientSceneProps>(function AmbientScene({
  appState,
  selectedSector = null,
  selectedIndex = null,
  onSelectSector,
}, ref) {
  const { data } = useTimelineData();
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);
  const dandelionRefs = useRef<(DandelionHandle | null)[]>([]);
  const transitioningRef = useRef(false);
  const transitionTlRef = useRef<gsap.core.Timeline | null>(null);
  const clusterTlRef = useRef<gsap.core.Timeline | null>(null);
  const sectorSwayTweens = useRef<gsap.core.Tween[]>([]);
  const clusterWaveRafRef = useRef<number>(0);
  const clusterWaveRunningRef = useRef(false);

  const stopClusterWave = () => {
    clusterWaveRunningRef.current = false;
    cancelAnimationFrame(clusterWaveRafRef.current);
  };
  const decorativeWrapRef = useRef<HTMLDivElement>(null);
  const prevAppStateRef = useRef<AppState>(appState);
  const prevSelectedIndexRef = useRef<number | null>(null);

  const isActive = appState === 'active';
  const isSector = appState === 'sector';

  // ── Transition: idle ↔ active (cluster / uncluster) ──
  useEffect(() => {
    const prev = prevAppStateRef.current;
    prevAppStateRef.current = appState;

    // idle → active: cluster dandelions toward center
    // (sector → active is handled by the reverse transition, skip here)
    if (appState === 'active' && prev === 'idle') {
      clusterTlRef.current?.kill();
      sectorSwayTweens.current.forEach((t) => t.kill());
      sectorSwayTweens.current = [];
      dandelionRefs.current.forEach((h) => h?.killTweens());

      const tl = gsap.timeline({
        onComplete: () => {
          // Compound wave while clustered — organic water-like motion
          stopClusterWave();
          const elements: HTMLElement[] = [];
          const phases: number[][] = [];
          dandelionRefs.current.forEach((h) => {
            const el = h?.getContainer();
            if (!el) return;
            elements.push(el);
            phases.push(Array.from({ length: 6 }, () => Math.random() * Math.PI * 2));
          });

          clusterWaveRunningRef.current = true;
          const startTime = performance.now() / 1000;
          const FADE_IN = 5;

          const waveTick = () => {
            if (!clusterWaveRunningRef.current) return;
            const t = performance.now() / 1000 - startTime;
            const fade = Math.min(1, t / FADE_IN);
            const amp = fade * fade;

            for (let i = 0; i < elements.length; i++) {
              const p = phases[i];
              const wx = amp * (
                8 * Math.sin(t * (Math.PI * 2 / 18) + p[0])
                + 3.5 * Math.sin(t * (Math.PI * 2 / 9) + p[1])
                + 1.2 * Math.sin(t * (Math.PI * 2 / 5) + p[2])
              );
              const wy = amp * (
                6.5 * Math.cos(t * (Math.PI * 2 / 18) + p[3])
                + 3 * Math.cos(t * (Math.PI * 2 / 9) + p[4])
                + 1 * Math.sin(t * (Math.PI * 2 / 5) + p[5])
              );
              gsap.set(elements[i], { x: wx, y: wy });
            }
            clusterWaveRafRef.current = requestAnimationFrame(waveTick);
          };
          clusterWaveRafRef.current = requestAnimationFrame(waveTick);
        },
      });
      clusterTlRef.current = tl;

      dataRef.current.dandelions.forEach((_, i) => {
        const el = dandelionRefs.current[i]?.getContainer();
        if (!el) return;
        const target = CLUSTER_POSITIONS[i];
        if (!target) return;
        tl.to(el, {
          left: target.x,
          top: target.y,
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          duration: CLUSTER_IN_DURATION,
          ease: CLUSTER_EASE,
        }, 0);
      });

      // Dim decorative wrapper
      if (decorativeWrapRef.current) {
        tl.to(decorativeWrapRef.current, { opacity: 0.4, duration: 1.0, ease: 'sine.out' }, 0);
      }
    }

    // active → idle: uncluster back to original positions, restart wander
    if (appState === 'idle' && prev === 'active') {
      clusterTlRef.current?.kill();
      clusterTlRef.current = null;
      sectorSwayTweens.current.forEach((t) => t.kill());
      sectorSwayTweens.current = [];
      stopClusterWave();

      const tl = gsap.timeline({
        onComplete: () => {
          dandelionRefs.current.forEach((h) => h?.restartTweens());
        },
      });
      clusterTlRef.current = tl;

      dataRef.current.dandelions.forEach((d, i) => {
        const el = dandelionRefs.current[i]?.getContainer();
        if (!el) return;
        tl.to(el, {
          left: d.placement.x,
          top: d.placement.y,
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          opacity: 0.85,
          duration: CLUSTER_OUT_DURATION,
          ease: CLUSTER_EASE,
          onStart: () => { el.style.pointerEvents = ''; },
        }, 0);
      });

      // Restore decorative wrapper opacity
      if (decorativeWrapRef.current) {
        tl.to(decorativeWrapRef.current, { opacity: 0.6, duration: 0.8, ease: 'sine.out' }, 0);
      }
    }
  }, [appState]);

  // ── Forward transition: active → sector  (and sector → sector on swipe) ──
  // Non-selected dandelions spread organically around the centered one.
  // Hand-tuned per-index positions (center coords), scale multipliers, and opacities
  // that preserve each dandelion's relative size and create an organic, uneven layout.
  // Order: Sustainability, ConsumerCare, WiN, Foundation, General
  const SPREAD_POSITIONS = [
    { cx: 972,  cy: 384,  s: 1.35, o: 0.25 }, // Sustainability (380) — center 90%, 20%
    { cx: 119,  cy: 576,  s: 1.30, o: 0.28 }, // ConsumerCare (330) — center 11%, 30%
    { cx: 86,   cy: 864,  s: 1.25, o: 0.22 }, // WiN (310) — center 8%, 45%
    { cx: 950,  cy: 595,  s: 1.35, o: 0.25 }, // Foundation (280) — center 88%, 31%
    { cx: 108,  cy: 288,  s: 1.05, o: 0.25 }, // General (540) — center 10%, 15%
  ];

  useEffect(() => {
    if (selectedSector === null) return;
    if (selectedSector.id === Sector.ViewAll) return;

    // Kill any in-flight transitions, sway, and wave
    clusterTlRef.current?.kill();
    transitionTlRef.current?.kill();
    sectorSwayTweens.current.forEach((t) => t.kill());
    sectorSwayTweens.current = [];
    stopClusterWave();
    transitioningRef.current = true;

    const { dandelionMove } = ANIMATION.sectorTransition;

    dandelionRefs.current.forEach((h) => h?.killTweens());

    const tl = gsap.timeline({
      onComplete: () => {
        transitioningRef.current = false;
        // Enable clicks on non-selected dandelions after animation
        if (selectedIndex !== null) {
          dataRef.current.dandelions.forEach((_, i) => {
            if (i === selectedIndex) return;
            const el = dandelionRefs.current[i]?.getContainer();
            if (el) el.style.pointerEvents = 'auto';
          });
        }
      },
    });
    transitionTlRef.current = tl;

    // Dim decorative wrapper further in sector view
    if (decorativeWrapRef.current) {
      tl.to(decorativeWrapRef.current, { opacity: 0.1, duration: 0.5, ease: 'power2.out' }, 0);
    }

    prevSelectedIndexRef.current = selectedIndex;

    if (selectedIndex !== null) {
      const selectedEl = dandelionRefs.current[selectedIndex]?.getContainer();
      const placement = dataRef.current.dandelions[selectedIndex]?.placement;

      const centeredCenterY = dandelionMove.targetY + CENTERED_DANDELION_SIZE / 2;

      if (selectedEl && placement) {
        const scaleFactor = CENTERED_DANDELION_SIZE / placement.size;
        tl.to(selectedEl, {
          left: 540 - placement.size / 2,
          top: centeredCenterY - placement.size / 2,
          x: 0,
          y: 0,
          scale: scaleFactor,
          rotation: 0,
          opacity: 1,
          duration: dandelionMove.duration,
          ease: dandelionMove.ease,
        }, 0);
      }

      // Spread non-selected dandelions to their hand-tuned positions
      dataRef.current.dandelions.forEach((_, i) => {
        if (i === selectedIndex) return;
        const el = dandelionRefs.current[i]?.getContainer();
        const p = dataRef.current.dandelions[i]?.placement;
        const sp = SPREAD_POSITIONS[i];
        if (!el || !p || !sp) return;

        tl.to(el, {
          left: sp.cx - p.size / 2,
          top: sp.cy - p.size / 2,
          x: 0,
          y: 0,
          scale: sp.s,
          rotation: 0,
          opacity: sp.o,
          duration: dandelionMove.duration,
          ease: dandelionMove.ease,
        }, 0);
      });
    }
  }, [selectedSector, selectedIndex]);

  // ── Reverse transition: sector → idle ──
  useEffect(() => {
    if (selectedSector !== null) return;
    if (!transitionTlRef.current) return;

    prevSelectedIndexRef.current = null;
    transitioningRef.current = true;
    transitionTlRef.current?.kill();
    transitionTlRef.current = null;
    sectorSwayTweens.current.forEach((t) => t.kill());
    sectorSwayTweens.current = [];
    stopClusterWave();

    const { dandelionMove, reverse } = ANIMATION.sectorTransition;

    const tl = gsap.timeline({
      onComplete: () => {
        transitioningRef.current = false;
        transitionTlRef.current = null;
      },
    });
    transitionTlRef.current = tl;

    dandelionRefs.current.forEach((h, i) => {
      const el = h?.getContainer();
      if (!el) return;
      const clusterPos = CLUSTER_POSITIONS[i];
      if (!clusterPos) return;
      tl.to(el, {
        left: clusterPos.x,
        top: clusterPos.y,
        scale: 1,
        rotation: 0,
        x: 0,
        y: 0,
        opacity: 0.85,
        duration: dandelionMove.duration,
        ease: dandelionMove.ease,
        onStart: () => {
          el.style.visibility = 'visible';
          el.style.pointerEvents = '';
        },
      }, reverse.moveBackDelay);
    });

    // Restore decorative wrapper
    if (decorativeWrapRef.current) {
      gsap.to(decorativeWrapRef.current, { opacity: 0.6, duration: 0.6, ease: 'power2.out' });
    }
  }, [selectedSector]);

  useImperativeHandle(ref, () => ({
    getSelectedContainer: () => {
      if (selectedIndex === null) return null;
      return dandelionRefs.current[selectedIndex]?.getContainer() ?? null;
    },
  }));

  const handleClick = useCallback(
    (sector: SectorConfig, index: number) => {
      if (transitioningRef.current) return;
      onSelectSector?.(sector, index);
    },
    [onSelectSector],
  );

  const makeGetOtherPositions = useCallback(
    (excludeIndex: number) => () => {
      const positions: { cx: number; cy: number }[] = [];
      dandelionRefs.current.forEach((h, i) => {
        if (i === excludeIndex) return;
        const el = h?.getContainer();
        if (!el) return;
        const left = parseFloat(el.style.left) || 0;
        const top = parseFloat(el.style.top) || 0;
        const w = parseFloat(el.style.width) || 0;
        const h2 = parseFloat(el.style.height) || 0;
        positions.push({ cx: left + w / 2, cy: top + h2 / 2 });
      });
      return positions;
    },
    [],
  );

  return (
    <>
      {/* Title removed */}

      {/* Decorative dandelions — background layer */}
      <div
        ref={decorativeWrapRef}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          pointerEvents: 'none',
          opacity: 0.47,
        }}
      >
        {DECORATIVE_DANDELIONS.map((d, i) => (
          <FloatingDandelion
            key={`deco-${i}`}
            color={d.color}
            glowColor={d.glowColor}
            size={d.size}
            x={d.x}
            y={d.y}
            delay={d.delay}
            label=""
            dimmed={isSector}
          />
        ))}
      </div>

      {/* Sector dandelions — interactive layer */}
      <div style={{
        position: 'absolute',
        inset: 0,
        zIndex: selectedIndex !== null ? 25 : 'auto',
        pointerEvents: selectedIndex !== null ? 'none' : 'auto',
      }}>
        {data.dandelions.map((d, i) => {
          const sectorConfig: SectorConfig = {
            id: d.sector.id as SectorConfig['id'],
            label: d.sector.label,
            color: d.sector.color,
            glowColor: d.sector.glowColor,
          };

          return (
            <FloatingDandelion
              key={d.sector.id}
              ref={(handle) => { dandelionRefs.current[i] = handle; }}
              color={d.sector.color}
              glowColor={d.sector.glowColor}
              size={d.placement.size}
              x={d.placement.x}
              y={d.placement.y}
              delay={d.placement.delay}
              label={d.sector.label}
              labelScale={
                d.sector.id === Sector.General ? 0.5
                : d.sector.id === Sector.Sustainability ? 0.5
                : d.sector.id === Sector.GEJV ? 0.5
                : d.sector.id === Sector.ConsumerCare ? 0.5
                : d.sector.id === Sector.Foundation ? 0.5
                : d.sector.id === Sector.WiN ? 0.5
                : 1
              }
              getOtherPositions={makeGetOtherPositions(i)}
              onClick={i === selectedIndex ? undefined : () => handleClick(sectorConfig, i)}
              showLabel={isActive || isSector}
              clickable={selectedIndex !== null && i !== selectedIndex}
            />
          );
        })}
      </div>
    </>
  );
});

export default AmbientScene;
