/**
 * WheelCenter — flat dark hub with hazy, melting edge.
 * No glossy highlights — just a solid dark disc whose border
 * dissolves softly into the surrounding space.
 * Drag to reposition the entire wheel on screen.
 */

import { useRef, useEffect } from 'react';

const CLICK_THRESHOLD = 5; // px — movement below this = click, above = drag

interface WheelCenterProps {
  cx: number;
  cy: number;
  radius: number;
  onDragDelta?: (dx: number, dy: number) => void;
  onActivate?: () => void;
}

export default function WheelCenter({ cx, cy, radius, onDragDelta, onActivate }: WheelCenterProps) {
  const hitRef = useRef<SVGCircleElement>(null);
  const onDragDeltaRef = useRef(onDragDelta);
  useEffect(() => { onDragDeltaRef.current = onDragDelta; }, [onDragDelta]);
  const onActivateRef = useRef(onActivate);
  useEffect(() => { onActivateRef.current = onActivate; }, [onActivate]);

  useEffect(() => {
    const el = hitRef.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let totalDist = 0;
    let isDragging = false;
    let pointerDown = false;

    const onPointerDown = (e: PointerEvent) => {
      e.stopPropagation();
      pointerDown = true;
      isDragging = false;
      totalDist = 0;
      startX = e.clientX;
      startY = e.clientY;
      el.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointerDown) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      startX = e.clientX;
      startY = e.clientY;
      totalDist += Math.abs(dx) + Math.abs(dy);

      if (!isDragging && totalDist >= CLICK_THRESHOLD) {
        isDragging = true;
      }
      if (isDragging) {
        onDragDeltaRef.current?.(dx, dy);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!pointerDown) return;
      pointerDown = false;
      if (el.hasPointerCapture(e.pointerId)) {
        el.releasePointerCapture(e.pointerId);
      }
      if (!isDragging) {
        onActivateRef.current?.();
      }
      isDragging = false;
      totalDist = 0;
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
    };
  }, []);

  // Haze extends beyond the hub radius for the melting/dissolving edge
  const hazeSpread = radius * 0.6;

  return (
    <g>
      <defs>
        {/* Hazy melting edge — solid dark core that dissolves outward */}
        <radialGradient
          id="wheel-hub-haze"
          cx={cx}
          cy={cy}
          r={radius + hazeSpread}
          gradientUnits="userSpaceOnUse"
        >
          {/* Solid dark core up to ~70% of the hub radius */}
          <stop offset="0%" stopColor="#151515" stopOpacity={1} />
          <stop offset={`${(radius * 0.7) / (radius + hazeSpread) * 100}%`} stopColor="#151515" stopOpacity={1} />
          {/* Start dissolving at the hub edge */}
          <stop offset={`${(radius * 0.9) / (radius + hazeSpread) * 100}%`} stopColor="#1a1a1a" stopOpacity={0.85} />
          <stop offset={`${radius / (radius + hazeSpread) * 100}%`} stopColor="#1e1e1e" stopOpacity={0.5} />
          {/* Melting haze beyond the hub boundary */}
          <stop offset={`${(radius + hazeSpread * 0.4) / (radius + hazeSpread) * 100}%`} stopColor="#222" stopOpacity={0.2} />
          <stop offset={`${(radius + hazeSpread * 0.7) / (radius + hazeSpread) * 100}%`} stopColor="#222" stopOpacity={0.08} />
          <stop offset="100%" stopColor="#222" stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* Hazy melting edge layer — larger circle with gradient fade */}
      <circle
        cx={cx}
        cy={cy}
        r={radius + hazeSpread}
        fill="url(#wheel-hub-haze)"
      />

      {/* Hit area — captures pointer for drag */}
      <circle
        ref={hitRef}
        cx={cx}
        cy={cy}
        r={radius}
        fill="transparent"
        style={{ cursor: 'grab' }}
      />
    </g>
  );
}
