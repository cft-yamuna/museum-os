/**
 * WheelScene — dual-ring wheel navigation.
 *
 * Positioned on the right side of the 1080x1920 portrait display.
 * Two independently rotatable rings (inner = sectors, outer = decades)
 * with momentum + snap-to-segment physics.
 * Center hub can be dragged to reposition the whole wheel.
 * After rings settle from rotation, auto-opens sector detail view after 1s.
 */

import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import gsap from 'gsap';
import InnerWheel from './InnerWheel';
import type { InnerSegmentData } from './InnerWheel';
import OuterWheel from './OuterWheel';
import type { OuterSegmentData } from './OuterWheel';
import WheelCenter from './WheelCenter';
import WheelAligner from './WheelAligner';
import { SECTOR_CONFIGS } from '../../data/sectors';
import { useTimelineData } from '../../context/TimelineDataContext';
import type { SectorConfig } from '../../types';
import { Sector } from '../../types';

// ─── Layout constants ─────────────────────────────────────────────────
const WHEEL_SIZE = 800;
const CX = WHEEL_SIZE / 2;
const CY = WHEEL_SIZE / 2;
const INNER_R_IN = 68;
const INNER_R_OUT = 220;
const OUTER_R_IN = 220;
const OUTER_R_OUT = 310;
const CENTER_R = 28;
const ALIGNER_TIP_Y = CY - OUTER_R_OUT - 8;

// ─── Snap physics ──────────────────────────────────────────────────────
const SEGMENT_ANGLE = 45;
const WHEEL_THRESHOLD = 50;
const SNAP_DURATION = 0.35;
const SNAP_EASE = 'power2.out';
const LOCK_DURATION = 150;

// ─── Auto-open delay ──────────────────────────────────────────────────
const AUTO_OPEN_DELAY = 1000; // ms after both rings settle

// ─── Container size ──────────────────────────────────────────────────
const CONTAINER_SIZE = 700;
const CONTAINER_RIGHT = -240;

// ─── Mouse shake detection ───────────────────────────────────────────
const SHAKE_DISTANCE = 80; // px of mouse movement within the time window
const SHAKE_WINDOW = 300; // ms

// ─── Inactivity auto-hide ─────────────────────────────────────────
const INACTIVITY_SECONDS = 30;

// ─── Segment data (derived from canonical SECTOR_CONFIGS) ──────────────
const INNER_SEGMENTS: InnerSegmentData[] = SECTOR_CONFIGS.map((config) => ({
  id: config.id,
  label: config.label,
  color: config.color,
}));

const OUTER_SEGMENTS: OuterSegmentData[] = [
  { label: '1945-1955', startYear: 1945, endYear: 1955 },
  { label: '1955-1965', startYear: 1955, endYear: 1965 },
  { label: '1965-1975', startYear: 1965, endYear: 1975 },
  { label: '1975-1985', startYear: 1975, endYear: 1985 },
  { label: '1985-1995', startYear: 1985, endYear: 1995 },
  { label: '1995-2005', startYear: 1995, endYear: 2005 },
  { label: '2005-2015', startYear: 2005, endYear: 2015 },
  { label: '2015-2025', startYear: 2015, endYear: 2025 },
];

function angleToIndex(angle: number, segmentCount: number): number {
  const segAngle = 360 / segmentCount;
  const normalized = (((-angle) % 360) + 360) % 360;
  return Math.round(normalized / segAngle) % segmentCount;
}

function getRingFromEvent(
  e: { clientX: number; clientY: number },
  svgEl: SVGSVGElement,
): 'inner' | 'outer' | 'none' {
  const rect = svgEl.getBoundingClientRect();
  const scaleX = WHEEL_SIZE / rect.width;
  const scaleY = WHEEL_SIZE / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  const dist = Math.sqrt((x - CX) ** 2 + (y - CY) ** 2);

  if (dist >= INNER_R_IN && dist <= INNER_R_OUT) return 'inner';
  if (dist >= OUTER_R_IN && dist <= OUTER_R_OUT) return 'outer';
  return 'none';
}

function getPointerAngle(
  e: { clientX: number; clientY: number },
  svgEl: SVGSVGElement,
): number {
  const rect = svgEl.getBoundingClientRect();
  const scaleX = WHEEL_SIZE / rect.width;
  const scaleY = WHEEL_SIZE / rect.height;
  const x = (e.clientX - rect.left) * scaleX - CX;
  const y = (e.clientY - rect.top) * scaleY - CY;
  return ((Math.atan2(y, x) * 180) / Math.PI + 90 + 360) % 360;
}

interface WheelSceneProps {
  onSelect?: (
    sector: SectorConfig,
    dandelionIndex: number | null,
    decadeRange: { startYear: number; endYear: number },
  ) => void;
  onResetToIdle?: () => void;
}

export default function WheelScene({ onSelect, onResetToIdle }: WheelSceneProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { data } = useTimelineData();

  // ─── Rotation state ────────────────────────────────────────────────
  const innerAngleRef = useRef(0);
  const outerAngleRef = useRef(0);
  const [innerAngle, setInnerAngle] = useState(0);
  const [outerAngle, setOuterAngle] = useState(0);

  const innerTweenRef = useRef<gsap.core.Tween | null>(null);
  const outerTweenRef = useRef<gsap.core.Tween | null>(null);
  const innerTargetRef = useRef(0);
  const outerTargetRef = useRef(0);
  const innerLockedRef = useRef(false);
  const outerLockedRef = useRef(false);
  const innerAccumRef = useRef(0);
  const outerAccumRef = useRef(0);

  // ─── Position offset state (drag-to-reposition) ────────────────────
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  // ─── Visibility state (hidden until mouse shake) ───────────────────
  // TODO: revert to false after design is finalized
  const [visible, setVisible] = useState(true);
  const visibleRef = useRef(true);
  const showTweenRef = useRef<gsap.core.Tween | null>(null);

  // ─── Inactivity countdown state ─────────────────────────────────
  const [countdown, setCountdown] = useState(INACTIVITY_SECONDS);
  const countdownRef = useRef(INACTIVITY_SECONDS);
  const inactivityIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Auto-open state ───────────────────────────────────────────────
  const autoOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const innerSettledRef = useRef(true);
  const outerSettledRef = useRef(true);
  const hasInteractedRef = useRef(false);

  // ─── Active indices (memoized) ─────────────────────────────────────
  const activeInner = useMemo(
    () => angleToIndex(innerAngle, INNER_SEGMENTS.length),
    [innerAngle],
  );
  const activeOuter = useMemo(
    () => angleToIndex(outerAngle, OUTER_SEGMENTS.length),
    [outerAngle],
  );

  // ─── Stable ref for onSelect to avoid re-rendering WheelCenter ────
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  // ─── Hub activation handler ────────────────────────────────────────
  const handleActivate = useCallback(() => {
    const sectorConfig = SECTOR_CONFIGS[activeInner];
    const outerSeg = OUTER_SEGMENTS[activeOuter];
    if (!sectorConfig || !outerSeg) return;

    const sector: SectorConfig = { ...sectorConfig };

    // Map sector ID to dandelion index (null for ViewAll)
    let dandelionIndex: number | null = null;
    if (sectorConfig.id !== Sector.ViewAll) {
      const idx = data.dandelions.findIndex((d) => d.sector.id === sectorConfig.id);
      dandelionIndex = idx >= 0 ? idx : null;
    }

    const decadeRange = { startYear: outerSeg.startYear, endYear: outerSeg.endYear };

    onSelectRef.current?.(sector, dandelionIndex, decadeRange);
  }, [activeInner, activeOuter, data.dandelions]);

  // Stable ref for handleActivate so auto-open fires with latest indices
  const handleActivateRef = useRef(handleActivate);
  useEffect(() => { handleActivateRef.current = handleActivate; }, [handleActivate]);

  // ─── Center hub drag handler ───────────────────────────────────────
  // Deltas are in screen pixels; divide by the FullscreenContainer's CSS scale
  // so the wheel tracks the pointer 1:1.
  const handleCenterDrag = useCallback((dx: number, dy: number) => {
    resetInactivityRef.current();
    const el = containerRef.current;
    if (!el) return;
    const renderedWidth = el.getBoundingClientRect().width;
    const scale = renderedWidth / CONTAINER_SIZE;
    setOffsetX(prev => prev + dx / scale);
    setOffsetY(prev => prev + dy / scale);
  }, []);

  // ─── Cancel auto-open timer ────────────────────────────────────────
  const cancelAutoOpen = useCallback(() => {
    if (autoOpenTimerRef.current !== null) {
      clearTimeout(autoOpenTimerRef.current);
      autoOpenTimerRef.current = null;
    }
  }, []);

  // ─── Try to start auto-open timer (only if both rings settled + user has interacted) ─
  const tryAutoOpen = useCallback(() => {
    cancelAutoOpen();
    if (innerSettledRef.current && outerSettledRef.current && hasInteractedRef.current) {
      autoOpenTimerRef.current = setTimeout(() => {
        autoOpenTimerRef.current = null;
        handleActivateRef.current();
      }, AUTO_OPEN_DELAY);
    }
  }, [cancelAutoOpen]);

  // ─── Inactivity countdown logic ─────────────────────────────────
  const stopInactivityTimer = useCallback(() => {
    if (inactivityIntervalRef.current !== null) {
      clearInterval(inactivityIntervalRef.current);
      inactivityIntervalRef.current = null;
    }
  }, []);

  // Stable ref for onResetToIdle
  const onResetToIdleRef = useRef(onResetToIdle);
  useEffect(() => { onResetToIdleRef.current = onResetToIdle; }, [onResetToIdle]);

  const resetToIdle = useCallback(() => {
    stopInactivityTimer();
    countdownRef.current = INACTIVITY_SECONDS;
    setCountdown(INACTIVITY_SECONDS);
    // Hide the wheel
    visibleRef.current = false;
    setVisible(false);
    // Tell App to go back to idle (unmounts SectorDetailView)
    onResetToIdleRef.current?.();
    // Do NOT restart timer — it restarts when mouse shake shows the wheel again
  }, [stopInactivityTimer]);

  const startInactivityTimer = useCallback(() => {
    stopInactivityTimer();
    countdownRef.current = INACTIVITY_SECONDS;
    setCountdown(INACTIVITY_SECONDS);

    inactivityIntervalRef.current = setInterval(() => {
      countdownRef.current -= 1;
      const next = countdownRef.current;
      setCountdown(next);

      if (next <= 0) {
        resetToIdle();
      }
    }, 1000);
  }, [stopInactivityTimer, resetToIdle]);

  const resetInactivity = useCallback(() => {
    countdownRef.current = INACTIVITY_SECONDS;
    setCountdown(INACTIVITY_SECONDS);
  }, []);

  const startInactivityTimerRef = useRef(startInactivityTimer);
  useEffect(() => { startInactivityTimerRef.current = startInactivityTimer; }, [startInactivityTimer]);

  const resetInactivityRef = useRef(resetInactivity);
  useEffect(() => { resetInactivityRef.current = resetInactivity; }, [resetInactivity]);

  // ─── Cleanup GSAP tweens + auto-open timer on unmount ──────────────
  useEffect(() => {
    return () => {
      innerTweenRef.current?.kill();
      outerTweenRef.current?.kill();
      showTweenRef.current?.kill();
      cancelAutoOpen();
      stopInactivityTimer();
    };
  }, [cancelAutoOpen, stopInactivityTimer]);

  // ─── Show wheel on interaction (mouse shake OR any touch) ────
  useEffect(() => {
    let lastX = 0;
    let lastY = 0;
    let accumulated = 0;
    let lastTime = 0;

    const revealWheel = () => {
      visibleRef.current = true;
      setVisible(true);
      startInactivityTimerRef.current();

      const el = containerRef.current;
      if (el) {
        showTweenRef.current?.kill();
        showTweenRef.current = gsap.fromTo(el,
          { opacity: 0, scale: 0.85 },
          { opacity: 1, scale: 1, duration: 0.5, ease: 'power2.out' },
        );
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (visibleRef.current) return;

      const now = performance.now();
      if (now - lastTime > SHAKE_WINDOW) {
        accumulated = 0;
      }
      lastTime = now;

      const dx = Math.abs(e.clientX - lastX);
      const dy = Math.abs(e.clientY - lastY);
      lastX = e.clientX;
      lastY = e.clientY;
      accumulated += dx + dy;

      if (accumulated >= SHAKE_DISTANCE) {
        revealWheel();
      }
    };

    // On touch devices, any touch reveals the wheel (no shake needed)
    const handleTouchStart = () => {
      if (visibleRef.current) return;
      revealWheel();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchstart', handleTouchStart);
    };
  }, []);

  // ─── Global interaction detection — reset inactivity on ANY screen interaction
  useEffect(() => {
    let lastGlobalReset = 0;
    const handleGlobalActivity = () => {
      const now = performance.now();
      if (now - lastGlobalReset > 500) {
        lastGlobalReset = now;
        resetInactivityRef.current();
      }
    };

    window.addEventListener('pointerdown', handleGlobalActivity);
    window.addEventListener('pointermove', handleGlobalActivity);
    window.addEventListener('wheel', handleGlobalActivity);
    window.addEventListener('touchstart', handleGlobalActivity);
    return () => {
      window.removeEventListener('pointerdown', handleGlobalActivity);
      window.removeEventListener('pointermove', handleGlobalActivity);
      window.removeEventListener('wheel', handleGlobalActivity);
      window.removeEventListener('touchstart', handleGlobalActivity);
    };
  }, []);

  // ─── Start inactivity countdown on mount ────────────────────────────
  useEffect(() => {
    if (visibleRef.current) {
      startInactivityTimerRef.current();
    }
  }, []);

  // ─── Snap a ring to the nearest segment ────────────────────────────
  const snapRing = useCallback((
    ring: 'inner' | 'outer',
    direction: 1 | -1,
  ) => {
    const angleRef = ring === 'inner' ? innerAngleRef : outerAngleRef;
    const tweenRef = ring === 'inner' ? innerTweenRef : outerTweenRef;
    const targetRef = ring === 'inner' ? innerTargetRef : outerTargetRef;
    const lockedRef = ring === 'inner' ? innerLockedRef : outerLockedRef;
    const accumRef = ring === 'inner' ? innerAccumRef : outerAccumRef;
    const setAngle = ring === 'inner' ? setInnerAngle : setOuterAngle;
    const settledRef = ring === 'inner' ? innerSettledRef : outerSettledRef;

    // If tween is active, build on the current target (allows queuing rapid scrolls)
    const base = tweenRef.current?.isActive() ? targetRef.current : angleRef.current;
    const target = base + direction * SEGMENT_ANGLE;
    targetRef.current = target;

    tweenRef.current?.kill();

    // Mark ring unsettled + cancel pending auto-open
    settledRef.current = false;
    cancelAutoOpen();

    const proxy = { value: angleRef.current };

    tweenRef.current = gsap.to(proxy, {
      value: target,
      duration: SNAP_DURATION,
      ease: SNAP_EASE,
      onUpdate: () => {
        angleRef.current = proxy.value;
        setAngle(proxy.value);
      },
      onComplete: () => {
        const normalized = ((target % 360) + 360) % 360;
        angleRef.current = normalized;
        targetRef.current = normalized;
        setAngle(normalized);
        accumRef.current = 0;

        lockedRef.current = true;
        setTimeout(() => { lockedRef.current = false; }, LOCK_DURATION);

        // Mark settled + try auto-open
        settledRef.current = true;
        tryAutoOpen();
      },
    });

    accumRef.current = 0;
  }, [cancelAutoOpen, tryAutoOpen]);

  const snapRingRef = useRef(snapRing);
  useEffect(() => { snapRingRef.current = snapRing; }, [snapRing]);

  // ─── Wheel/scroll handler ──────────────────────────────────────────
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      resetInactivityRef.current();
      const ring = getRingFromEvent(e, svg);
      if (ring === 'none') return;

      // Mark interaction + cancel pending auto-open
      hasInteractedRef.current = true;
      cancelAutoOpen();

      if (ring === 'inner') {
        if (innerLockedRef.current) return;
        innerAccumRef.current += e.deltaY;
        if (innerAccumRef.current > WHEEL_THRESHOLD) {
          snapRingRef.current('inner', 1);
        } else if (innerAccumRef.current < -WHEEL_THRESHOLD) {
          snapRingRef.current('inner', -1);
        }
      } else {
        if (outerLockedRef.current) return;
        outerAccumRef.current += e.deltaY;
        if (outerAccumRef.current > WHEEL_THRESHOLD) {
          snapRingRef.current('outer', 1);
        } else if (outerAccumRef.current < -WHEEL_THRESHOLD) {
          snapRingRef.current('outer', -1);
        }
      }
    };

    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, [cancelAutoOpen]);

  // ─── Snap to nearest segment (used on drag release) ────────────────
  const snapToNearest = useCallback((ring: 'inner' | 'outer') => {
    const angleRef = ring === 'inner' ? innerAngleRef : outerAngleRef;
    const tweenRef = ring === 'inner' ? innerTweenRef : outerTweenRef;
    const targetRef = ring === 'inner' ? innerTargetRef : outerTargetRef;
    const lockedRef = ring === 'inner' ? innerLockedRef : outerLockedRef;
    const setAngle = ring === 'inner' ? setInnerAngle : setOuterAngle;
    const settledRef = ring === 'inner' ? innerSettledRef : outerSettledRef;

    tweenRef.current?.kill();

    // Mark ring unsettled + cancel pending auto-open
    settledRef.current = false;
    cancelAutoOpen();

    const current = angleRef.current;
    const target = Math.round(current / SEGMENT_ANGLE) * SEGMENT_ANGLE;
    const normalized = ((target % 360) + 360) % 360;
    targetRef.current = normalized;
    const proxy = { value: current };

    tweenRef.current = gsap.to(proxy, {
      value: target,
      duration: 0.25,
      ease: SNAP_EASE,
      onUpdate: () => {
        angleRef.current = proxy.value;
        setAngle(proxy.value);
      },
      onComplete: () => {
        angleRef.current = normalized;
        targetRef.current = normalized;
        setAngle(normalized);
        lockedRef.current = true;
        setTimeout(() => { lockedRef.current = false; }, LOCK_DURATION);

        // Mark settled + try auto-open
        settledRef.current = true;
        tryAutoOpen();
      },
    });
  }, [cancelAutoOpen, tryAutoOpen]);

  const snapToNearestRef = useRef(snapToNearest);
  useEffect(() => { snapToNearestRef.current = snapToNearest; }, [snapToNearest]);

  // ─── Drag handler (free-rotate + snap on release, tap = instant activate) ──
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const RING_TAP_THRESHOLD = 2; // degrees — below this = tap, above = drag

    let dragging: 'inner' | 'outer' | null = null;
    let prevAngle = 0;
    let activePointerId: number | null = null;
    let totalDragDist = 0;

    const handlePointerDown = (e: PointerEvent) => {
      const ring = getRingFromEvent(e, svg);
      if (ring === 'none') return;

      // Mark interaction + cancel pending auto-open + reset inactivity
      hasInteractedRef.current = true;
      cancelAutoOpen();
      resetInactivityRef.current();

      const tweenRef = ring === 'inner' ? innerTweenRef : outerTweenRef;
      tweenRef.current?.kill();

      dragging = ring;
      prevAngle = getPointerAngle(e, svg);
      activePointerId = e.pointerId;
      totalDragDist = 0;
      svg.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!dragging || e.pointerId !== activePointerId) return;
      resetInactivityRef.current();

      const currentAngle = getPointerAngle(e, svg);
      let delta = currentAngle - prevAngle;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      prevAngle = currentAngle;
      totalDragDist += Math.abs(delta);

      const angleRef = dragging === 'inner' ? innerAngleRef : outerAngleRef;
      const setAngle = dragging === 'inner' ? setInnerAngle : setOuterAngle;

      angleRef.current += delta;
      setAngle(angleRef.current);
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (e.pointerId !== activePointerId) return;
      if (activePointerId !== null && svg.hasPointerCapture(activePointerId)) {
        svg.releasePointerCapture(activePointerId);
      }
      if (dragging) {
        if (totalDragDist < RING_TAP_THRESHOLD) {
          // Tap on ring — activate immediately (skip auto-open wait)
          handleActivateRef.current();
        } else {
          snapToNearestRef.current(dragging);
        }
      }
      dragging = null;
      activePointerId = null;
    };

    // Throttled mousemove — reset inactivity on hover (even without drag)
    let lastResetTime = 0;
    const handleMouseActivity = () => {
      const now = performance.now();
      if (now - lastResetTime > 500) {
        lastResetTime = now;
        resetInactivityRef.current();
      }
    };

    svg.addEventListener('pointerdown', handlePointerDown);
    svg.addEventListener('pointermove', handlePointerMove);
    svg.addEventListener('pointerup', handlePointerUp);
    svg.addEventListener('pointercancel', handlePointerUp);
    svg.addEventListener('mousemove', handleMouseActivity);

    return () => {
      if (activePointerId !== null && svg.hasPointerCapture(activePointerId)) {
        svg.releasePointerCapture(activePointerId);
      }
      svg.removeEventListener('pointerdown', handlePointerDown);
      svg.removeEventListener('pointermove', handlePointerMove);
      svg.removeEventListener('pointerup', handlePointerUp);
      svg.removeEventListener('pointercancel', handlePointerUp);
      svg.removeEventListener('mousemove', handleMouseActivity);
    };
  }, [cancelAutoOpen]);

  return (
    <>
    {/* Inactivity countdown — bottom-right of canvas */}
    <div
      style={{
        position: 'absolute',
        bottom: 40,
        right: 40,
        zIndex: 10,
        color: countdown <= 5 ? 'rgba(255,180,180,0.8)' : 'rgba(255,255,255,0.45)',
        fontSize: 18,
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        fontWeight: 600,
        letterSpacing: 1,
        pointerEvents: 'none',
        transition: 'color 0.3s ease',
      }}
    >
      {Math.max(0, countdown)}s
    </div>
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        right: CONTAINER_RIGHT,
        top: '50%',
        transform: `translateY(-50%) translate(${offsetX}px, ${offsetY}px)`,
        width: CONTAINER_SIZE,
        height: CONTAINER_SIZE,
        zIndex: 50,
        pointerEvents: visible ? 'auto' : 'none',
        opacity: visible ? 1 : 0,
      }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WHEEL_SIZE} ${WHEEL_SIZE}`}
        width="100%"
        height="100%"
        role="navigation"
        aria-label="Sector and decade wheel navigation"
        style={{ display: 'block', touchAction: 'none', overflow: 'visible', willChange: 'contents' }}
      >
        {/* Outer decade ring */}
        <OuterWheel
          cx={CX}
          cy={CY}
          innerRadius={OUTER_R_IN}
          outerRadius={OUTER_R_OUT}
          segments={OUTER_SEGMENTS}
          angle={outerAngle}
          activeIndex={activeOuter}
        />

        {/* Inner sector ring */}
        <InnerWheel
          cx={CX}
          cy={CY}
          innerRadius={INNER_R_IN}
          outerRadius={INNER_R_OUT}
          renderOuterRadius={OUTER_R_OUT}
          segments={INNER_SEGMENTS}
          angle={innerAngle}
          activeIndex={activeInner}
        />

        {/* Center hub — drag to reposition, tap to activate sector */}
        <WheelCenter
          cx={CX}
          cy={CY}
          radius={CENTER_R}
          onDragDelta={handleCenterDrag}
          onActivate={handleActivate}
        />

        {/* Aligner triangle at 12 o'clock */}
        <WheelAligner cx={CX} tipY={ALIGNER_TIP_Y} />

      </svg>
    </div>
    </>
  );
}
