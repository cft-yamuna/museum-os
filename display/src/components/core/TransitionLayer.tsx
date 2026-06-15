import { useState, useEffect, useRef } from 'react';
import type { TransitionType } from '@/lib/types';

interface TransitionLayerProps {
  /** Unique key for the current content (triggers transition when changed) */
  contentKey: string;
  /** The content to display */
  children: React.ReactNode;
  /** Transition type */
  transition: TransitionType;
  /** Transition duration in ms */
  transitionDuration: number;
  /** Called when transition completes */
  onTransitionComplete?: () => void;
}

export function TransitionLayer({
  contentKey,
  children,
  transition,
  transitionDuration,
  onTransitionComplete,
}: TransitionLayerProps) {
  // Track two layers: front (visible) and back (incoming)
  const [layers, setLayers] = useState<{
    front: { key: string; content: React.ReactNode };
    back: { key: string; content: React.ReactNode } | null;
  }>({
    front: { key: contentKey, content: children },
    back: null,
  });
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const prevKeyRef = useRef(contentKey);

  // When contentKey changes, start transition
  useEffect(() => {
    if (contentKey === prevKeyRef.current) {
      // Just update the front content without transition
      setLayers((prev) => ({ ...prev, front: { key: contentKey, content: children } }));
      return;
    }

    prevKeyRef.current = contentKey;

    if (transition === 'none') {
      // Instant switch
      setLayers({ front: { key: contentKey, content: children }, back: null });
      onTransitionComplete?.();
      return;
    }

    // Start transition: put new content in back layer
    setLayers((prev) => ({
      front: prev.front,
      back: { key: contentKey, content: children },
    }));

    // Trigger animation on next frame
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        setIsTransitioning(true);
      });
    });

    // After transition duration, swap layers
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
    }
    transitionTimerRef.current = setTimeout(() => {
      setIsTransitioning(false);
      setLayers({ front: { key: contentKey, content: children }, back: null });
      onTransitionComplete?.();
    }, transitionDuration);

    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
    // Only trigger on key change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey]);

  // Build styles based on transition type
  function getFrontStyle(): React.CSSProperties {
    const base: React.CSSProperties = {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      transform: 'translateZ(0)', // GPU acceleration
    };

    if (!isTransitioning || !layers.back) return base;

    const dur = `${transitionDuration}ms`;

    switch (transition) {
      case 'fade':
        return { ...base, opacity: 0, transition: `opacity ${dur} ease-in-out` };
      case 'slide-left':
        return { ...base, transform: 'translateX(-100%) translateZ(0)', transition: `transform ${dur} ease-in-out` };
      case 'slide-right':
        return { ...base, transform: 'translateX(100%) translateZ(0)', transition: `transform ${dur} ease-in-out` };
      case 'dissolve':
        return { ...base, opacity: 0, transition: `opacity ${dur} steps(8)` };
      default:
        return base;
    }
  }

  function getBackStyle(): React.CSSProperties {
    const base: React.CSSProperties = {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      transform: 'translateZ(0)',
    };

    if (!isTransitioning) {
      switch (transition) {
        case 'fade':
        case 'dissolve':
          return { ...base, opacity: 0 };
        case 'slide-left':
          return { ...base, transform: 'translateX(100%) translateZ(0)' };
        case 'slide-right':
          return { ...base, transform: 'translateX(-100%) translateZ(0)' };
        default:
          return { ...base, opacity: 0 };
      }
    }

    const dur = `${transitionDuration}ms`;

    switch (transition) {
      case 'fade':
        return { ...base, opacity: 1, transition: `opacity ${dur} ease-in-out` };
      case 'slide-left':
        return { ...base, transform: 'translateX(0) translateZ(0)', transition: `transform ${dur} ease-in-out` };
      case 'slide-right':
        return { ...base, transform: 'translateX(0) translateZ(0)', transition: `transform ${dur} ease-in-out` };
      case 'dissolve':
        return { ...base, opacity: 1, transition: `opacity ${dur} steps(8)` };
      default:
        return base;
    }
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* Front layer (current content) */}
      <div style={getFrontStyle()}>
        {layers.front.content}
      </div>

      {/* Back layer (incoming content during transition) */}
      {layers.back && (
        <div style={getBackStyle()}>
          {layers.back.content}
        </div>
      )}
    </div>
  );
}
