import { useRef, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { VideoPlayer } from '@/components/core/VideoPlayer';
import { renderAsteriskBold } from '@/lib/richText';

interface ScrollSection {
  id: string;
  type: 'text' | 'image' | 'video' | 'heading';
  content: string;
  caption?: string;
  style?: Record<string, string>;
}

interface TouchScrollerProps {
  content: ScrollSection[];
  autoScroll: boolean;
  autoScrollSpeed: number;
  inactivityTimeout: number;
  autoScrollStartDelayMs?: number;
  onAutoScrollWrap?: () => void;
  onActiveSectionChange?: (sectionId: string) => void;
  onInteraction?: () => void;
  onUserInteraction?: () => void;
  onZoomStateChange?: (isZoomed: boolean) => void;
  backgroundColor?: string;
  fit?: 'cover' | 'contain';
  resetToFirstFrame?: boolean;
  isIdle?: boolean;
  jumpToSectionId?: string | null;
  zoomEnabled?: boolean;
  zoomImageOnly?: boolean;
  forceResetZoomSignal?: number;
}

interface TouchPoint {
  x: number;
  y: number;
  time: number;
}

type GestureMode = 'none' | 'scroll' | 'pan';

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const TOUCH_SCROLL_SENSITIVITY = 1.0;
const ZOOM_PAN_TOUCH_X_SENSITIVITY = 1.0;
const ZOOM_PAN_TOUCH_Y_SENSITIVITY = 1.0;
const ZOOM_PAN_MOUSE_X_SENSITIVITY = 1.0;
const ZOOM_PAN_MOUSE_Y_SENSITIVITY = 1.0;
const ZOOM_PAN_WHEEL_X_SENSITIVITY = 1.0;
const ZOOM_PAN_WHEEL_Y_SENSITIVITY = 1.0;
function clampZoom(scale: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
}

function getTouchDistance(
  a: { clientX: number; clientY: number },
  b: { clientX: number; clientY: number }
): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

function getTouchMidpoint(
  a: { clientX: number; clientY: number },
  b: { clientX: number; clientY: number }
): { x: number; y: number } {
  return {
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  };
}

export function TouchScroller({
  content,
  autoScroll,
  autoScrollSpeed,
  inactivityTimeout,
  autoScrollStartDelayMs,
  onAutoScrollWrap,
  onActiveSectionChange,
  onInteraction,
  onUserInteraction,
  onZoomStateChange,
  backgroundColor,
  fit,
  resetToFirstFrame,
  isIdle,
  jumpToSectionId,
  zoomEnabled = false,
  zoomImageOnly = true,
  forceResetZoomSignal,
}: TouchScrollerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollYRef = useRef(0);
  const lastTouchXRef = useRef(0);
  const lastTouchYRef = useRef(0);
  const touchPointsRef = useRef<TouchPoint[]>([]);
  const gestureModeRef = useRef<GestureMode>('none');
  const mouseGestureModeRef = useRef<GestureMode>('none');
  const momentumAnimationRef = useRef<number | null>(null);
  const autoScrollAnimationRef = useRef<number | null>(null);
  const resetAnimationRef = useRef<number | null>(null);
  const progressAnimationRef = useRef<number | null>(null);
  const smoothScrollAnimationRef = useRef<number | null>(null);
  const restartAutoScrollRef = useRef<(() => void) | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const isTouchingRef = useRef(false);
  const velocityRef = useRef(0);
  const lastInteractionRef = useRef(0);
  const maxScrollYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const zoomScaleRef = useRef(1);
  const panXRef = useRef(0);
  const panYRef = useRef(0);
  const pinchStartDistanceRef = useRef(0);
  const isPinchingRef = useRef(false);
  const lastJumpSectionIdRef = useRef<string | null>(null);
  const lastActiveSectionIdRef = useRef<string | null>(null);
  const zoomFrameRef = useRef<number | null>(null);
  const zoomedStateRef = useRef(false);

  const emitZoomState = useCallback((isZoomed: boolean) => {
    if (zoomedStateRef.current === isZoomed) return;
    zoomedStateRef.current = isZoomed;
    if (onZoomStateChange) onZoomStateChange(isZoomed);
  }, [onZoomStateChange]);

  const cancelMomentum = useCallback(() => {
    if (momentumAnimationRef.current !== null) {
      cancelAnimationFrame(momentumAnimationRef.current);
      momentumAnimationRef.current = null;
    }
    velocityRef.current = 0;
  }, []);

  const cancelAutoScroll = useCallback(() => {
    if (autoScrollAnimationRef.current !== null) {
      cancelAnimationFrame(autoScrollAnimationRef.current);
      autoScrollAnimationRef.current = null;
    }
  }, []);

  const cancelSmoothScroll = useCallback(() => {
    if (smoothScrollAnimationRef.current !== null) {
      cancelAnimationFrame(smoothScrollAnimationRef.current);
      smoothScrollAnimationRef.current = null;
    }
  }, []);

  const signalInteraction = useCallback(() => {
    lastInteractionRef.current = Date.now();
    if (onInteraction) onInteraction();
  }, [onInteraction]);

  const signalUserInteraction = useCallback(() => {
    lastInteractionRef.current = Date.now();
    if (onInteraction) onInteraction();
    if (onUserInteraction) onUserInteraction();
  }, [onInteraction, onUserInteraction]);

  const canZoomFromTarget = useCallback((target: EventTarget | null) => {
    if (!zoomEnabled) return false;
    if (!zoomImageOnly) return true;
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('img'));
  }, [zoomEnabled, zoomImageOnly]);

  const applyTransform = useCallback(() => {
    if (!contentRef.current) return;
    const scale = zoomScaleRef.current;
    const translateX = panXRef.current;
    const translateY = -scrollYRef.current + panYRef.current;
    contentRef.current.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`;
  }, []);

  const calculateMaxScroll = useCallback(() => {
    if (!containerRef.current || !contentRef.current) return;
    const containerHeight = containerRef.current.clientHeight;
    const contentHeight = contentRef.current.scrollHeight * zoomScaleRef.current;
    maxScrollYRef.current = Math.max(0, contentHeight - containerHeight);
  }, []);

  const clampPanToBounds = useCallback(() => {
    if (!containerRef.current || !contentRef.current) return;

    const scale = zoomScaleRef.current;
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;
    const contentWidth = contentRef.current.scrollWidth * scale;
    const contentHeight = contentRef.current.scrollHeight * scale;

    let minTranslateX = 0;
    let maxTranslateX = 0;
    if (contentWidth <= containerWidth) {
      const centeredX = (containerWidth - contentWidth) / 2;
      minTranslateX = centeredX;
      maxTranslateX = centeredX;
    } else {
      minTranslateX = containerWidth - contentWidth;
      maxTranslateX = 0;
    }

    panXRef.current = Math.max(minTranslateX, Math.min(panXRef.current, maxTranslateX));

    const scrollY = scrollYRef.current;
    const currentTranslateY = -scrollY + panYRef.current;

    let minTranslateY = 0;
    let maxTranslateY = 0;
    if (contentHeight <= containerHeight) {
      const centeredY = (containerHeight - contentHeight) / 2;
      minTranslateY = centeredY;
      maxTranslateY = centeredY;
    } else {
      minTranslateY = containerHeight - contentHeight;
      maxTranslateY = 0;
    }

    const clampedTranslateY = Math.max(minTranslateY, Math.min(currentTranslateY, maxTranslateY));
    panYRef.current = clampedTranslateY + scrollY;
  }, []);

  const updateScroll = useCallback((newScrollY: number) => {
    const maxScroll = maxScrollYRef.current;
    const clampedScrollY = Math.max(0, Math.min(newScrollY, maxScroll));
    scrollYRef.current = clampedScrollY;
    clampPanToBounds();
    applyTransform();
  }, [applyTransform, clampPanToBounds]);

  const smoothSetScroll = useCallback((nextScrollY: number) => {
    updateScroll(nextScrollY);
  }, [updateScroll]);

  const setZoomAtPoint = useCallback((nextScale: number, anchor?: { x: number; y: number }) => {
    const container = containerRef.current;
    const clamped = clampZoom(nextScale);
    const previous = zoomScaleRef.current;
    if (Math.abs(previous - clamped) < 0.004) return;

    const anchorX = anchor?.x ?? (container ? container.clientWidth / 2 : 0);
    const anchorY = anchor?.y ?? (container ? container.clientHeight / 2 : 0);

    const oldTranslateX = panXRef.current;
    const oldTranslateY = -scrollYRef.current + panYRef.current;
    const scaleRatio = clamped / previous;

    zoomScaleRef.current = clamped;

    if (clamped <= MIN_ZOOM + 0.001) {
      panXRef.current = 0;
      panYRef.current = 0;
    } else {
      const nextTranslateX = anchorX - (anchorX - oldTranslateX) * scaleRatio;
      const nextTranslateY = anchorY - (anchorY - oldTranslateY) * scaleRatio;
      panXRef.current = nextTranslateX;
      panYRef.current = nextTranslateY + scrollYRef.current;
    }

    calculateMaxScroll();
    if (scrollYRef.current > maxScrollYRef.current) {
      scrollYRef.current = maxScrollYRef.current;
    }
    clampPanToBounds();
    applyTransform();
    emitZoomState(clamped > MIN_ZOOM + 0.001);
  }, [applyTransform, calculateMaxScroll, clampPanToBounds, emitZoomState]);

  const queueZoomAtPoint = useCallback((nextScale: number, anchor?: { x: number; y: number }) => {
    if (zoomFrameRef.current !== null) {
      cancelAnimationFrame(zoomFrameRef.current);
    }
    zoomFrameRef.current = requestAnimationFrame(() => {
      zoomFrameRef.current = null;
      setZoomAtPoint(nextScale, anchor);
    });
  }, [setZoomAtPoint]);

  const setZoom = useCallback((nextScale: number) => {
    setZoomAtPoint(nextScale);
  }, [setZoomAtPoint]);

  useEffect(() => {
    emitZoomState(zoomScaleRef.current > MIN_ZOOM + 0.001);
  }, [emitZoomState]);

  useEffect(() => {
    if (forceResetZoomSignal === undefined) return;
    if (zoomScaleRef.current <= MIN_ZOOM + 0.001) return;
    setZoom(1);
  }, [forceResetZoomSignal, setZoom]);

  const startMomentum = useCallback(
    (
      initialVelocity: {
        scrollY: number;
        panX?: number;
        panY?: number;
      }
    ) => {
      cancelMomentum();

      const friction = 0.95;
      const minVelocity = 0.5;
      let velocityY = initialVelocity.scrollY;
      let velocityPanX = initialVelocity.panX || 0;
      let velocityPanY = initialVelocity.panY || 0;

      const animate = () => {
        velocityY *= friction;
        velocityPanX *= friction;
        velocityPanY *= friction;

        const stillScrolling = Math.abs(velocityY) >= minVelocity;
        const stillPanning = Math.abs(velocityPanX) >= minVelocity || Math.abs(velocityPanY) >= minVelocity;

        if (!stillScrolling && !stillPanning) {
          momentumAnimationRef.current = null;
          return;
        }

        if (stillScrolling) {
          const newScrollY = scrollYRef.current + velocityY;
          updateScroll(newScrollY);
        }
        if (stillPanning) {
          panXRef.current += velocityPanX;
          panYRef.current += velocityPanY;
          clampPanToBounds();
          applyTransform();
        }

        momentumAnimationRef.current = requestAnimationFrame(animate);
      };

      momentumAnimationRef.current = requestAnimationFrame(animate);
    },
    [cancelMomentum, updateScroll, clampPanToBounds, applyTransform]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        cancelMomentum();
        cancelSmoothScroll();
        cancelAutoScroll();
        signalUserInteraction();
        if (!canZoomFromTarget(e.target)) {
          isPinchingRef.current = false;
          pinchStartDistanceRef.current = 0;
          touchPointsRef.current = [];
          return;
        }
        pinchStartDistanceRef.current = getTouchDistance(e.touches[0], e.touches[1]);
        isPinchingRef.current = true;
        touchPointsRef.current = [];
        return;
      }

      if (e.touches.length !== 1 || isPinchingRef.current) return;

      cancelMomentum();
      cancelSmoothScroll();
      cancelAutoScroll();
      signalUserInteraction();
      isTouchingRef.current = true;
      gestureModeRef.current = zoomScaleRef.current > 1.01 ? 'pan' : 'scroll';

      const touch = e.touches[0];
      lastTouchXRef.current = touch.clientX;
      lastTouchYRef.current = touch.clientY;
      if (gestureModeRef.current === 'pan') {
        touchPointsRef.current = [];
      } else {
        touchPointsRef.current = [{ x: touch.clientX, y: touch.clientY, time: Date.now() }];
      }
    },
    [cancelMomentum, signalUserInteraction, canZoomFromTarget, cancelSmoothScroll, cancelAutoScroll]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const container = containerRef.current;
        if (!canZoomFromTarget(e.target)) {
          signalUserInteraction();
          return;
        }
        const distance = getTouchDistance(e.touches[0], e.touches[1]);
        const midpoint = getTouchMidpoint(e.touches[0], e.touches[1]);
        if (!container) return;
        const bounds = container.getBoundingClientRect();

        const anchor = {
          x: midpoint.x - bounds.left,
          y: midpoint.y - bounds.top,
        };
        if (!isPinchingRef.current || pinchStartDistanceRef.current <= 0) {
          isPinchingRef.current = true;
          pinchStartDistanceRef.current = distance;
          return;
        }
        const ratio = distance / pinchStartDistanceRef.current;
        queueZoomAtPoint(zoomScaleRef.current * ratio, anchor);
        pinchStartDistanceRef.current = distance;
        signalUserInteraction();
        return;
      }

      if (e.touches.length !== 1 || isPinchingRef.current) return;

      e.preventDefault();

      const touch = e.touches[0];
      const currentX = touch.clientX;
      const currentY = touch.clientY;

      if (gestureModeRef.current === 'pan') {
        const deltaX = (currentX - lastTouchXRef.current) * ZOOM_PAN_TOUCH_X_SENSITIVITY;
        const deltaY = (currentY - lastTouchYRef.current) * ZOOM_PAN_TOUCH_Y_SENSITIVITY;
        lastTouchXRef.current = currentX;
        lastTouchYRef.current = currentY;

        panXRef.current += deltaX;
        panYRef.current += deltaY;
        clampPanToBounds();
        applyTransform();
        signalUserInteraction();
        const now = Date.now();
        touchPointsRef.current.push({ x: currentX, y: currentY, time: now });
        touchPointsRef.current = touchPointsRef.current.filter((point) => {
          return now - point.time < 120;
        });
        return;
      }

      const deltaY = (lastTouchYRef.current - currentY) * TOUCH_SCROLL_SENSITIVITY;
      lastTouchXRef.current = currentX;
      lastTouchYRef.current = currentY;

      const newScrollY = scrollYRef.current + deltaY;
      smoothSetScroll(newScrollY);

      const now = Date.now();
      lastInteractionRef.current = now;
      if (onInteraction) onInteraction();
      if (onUserInteraction) onUserInteraction();
      touchPointsRef.current.push({ x: currentX, y: currentY, time: now });

      touchPointsRef.current = touchPointsRef.current.filter((point) => {
        return now - point.time < 100;
      });
    },
    [smoothSetScroll, queueZoomAtPoint, onInteraction, onUserInteraction, signalUserInteraction, canZoomFromTarget, clampPanToBounds, applyTransform]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const endingMode = gestureModeRef.current;

      if (e.touches.length < 2 && isPinchingRef.current) {
        isPinchingRef.current = false;
        pinchStartDistanceRef.current = 0;
        if (zoomFrameRef.current !== null) {
          cancelAnimationFrame(zoomFrameRef.current);
          zoomFrameRef.current = null;
        }
        if (e.touches.length === 1) {
          const touch = e.touches[0];
          lastTouchXRef.current = touch.clientX;
          lastTouchYRef.current = touch.clientY;
          gestureModeRef.current = zoomScaleRef.current > 1.01 ? 'pan' : 'scroll';
          if (gestureModeRef.current === 'pan') {
            touchPointsRef.current = [];
          } else {
            touchPointsRef.current = [{ x: touch.clientX, y: touch.clientY, time: Date.now() }];
          }
          isTouchingRef.current = true;
          return;
        }
      }

      if (e.touches.length === 0) {
        isTouchingRef.current = false;
        if (restartAutoScrollRef.current) {
          restartAutoScrollRef.current();
        }
        gestureModeRef.current = 'none';
      }

      if (endingMode === 'pan') {
        const points = touchPointsRef.current;
        if (points.length >= 2) {
          const firstPoint = points[0];
          const lastPoint = points[points.length - 1];
          const timeDiff = lastPoint.time - firstPoint.time;
          if (timeDiff > 0) {
            const velocityX = ((lastPoint.x - firstPoint.x) / timeDiff) * 16 * ZOOM_PAN_TOUCH_X_SENSITIVITY;
            const velocityY = ((lastPoint.y - firstPoint.y) / timeDiff) * 16 * ZOOM_PAN_TOUCH_Y_SENSITIVITY;
            startMomentum({ scrollY: 0, panX: velocityX, panY: velocityY });
          }
        }
        touchPointsRef.current = [];
        return;
      }

      const points = touchPointsRef.current;
      if (points.length < 2) {
        touchPointsRef.current = [];
        return;
      }

      const firstPoint = points[0];
      const lastPoint = points[points.length - 1];
      const timeDiff = lastPoint.time - firstPoint.time;

      if (timeDiff > 0) {
        const distance = lastPoint.y - firstPoint.y;
        const velocity = -(distance / timeDiff) * 16;
        startMomentum({ scrollY: velocity });
      }

      touchPointsRef.current = [];
    },
    [startMomentum]
  );

  // ---- Mouse drag handlers ----
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDraggingRef.current = true;
      cancelMomentum();
      cancelSmoothScroll();
      cancelAutoScroll();
      signalUserInteraction();
      mouseGestureModeRef.current = zoomScaleRef.current > 1.01 ? 'pan' : 'scroll';

      lastTouchXRef.current = e.clientX;
      lastTouchYRef.current = e.clientY;
      if (mouseGestureModeRef.current === 'pan') {
        touchPointsRef.current = [];
      } else {
        touchPointsRef.current = [{ x: e.clientX, y: e.clientY, time: Date.now() }];
      }

      e.preventDefault();
    },
    [cancelMomentum, signalUserInteraction, cancelSmoothScroll, cancelAutoScroll]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDraggingRef.current) return;

      const currentX = e.clientX;
      const currentY = e.clientY;

      if (mouseGestureModeRef.current === 'pan') {
        const deltaX = (currentX - lastTouchXRef.current) * ZOOM_PAN_MOUSE_X_SENSITIVITY;
        const deltaY = (currentY - lastTouchYRef.current) * ZOOM_PAN_MOUSE_Y_SENSITIVITY;
        lastTouchXRef.current = currentX;
        lastTouchYRef.current = currentY;

        panXRef.current += deltaX;
        panYRef.current += deltaY;
        clampPanToBounds();
        applyTransform();
        signalUserInteraction();
        const now = Date.now();
        touchPointsRef.current.push({ x: currentX, y: currentY, time: now });
        touchPointsRef.current = touchPointsRef.current.filter((point) => {
          return now - point.time < 120;
        });
        return;
      }

      const deltaY = (lastTouchYRef.current - currentY) * TOUCH_SCROLL_SENSITIVITY;
      lastTouchXRef.current = currentX;
      lastTouchYRef.current = currentY;

      const newScrollY = scrollYRef.current + deltaY;
      smoothSetScroll(newScrollY);

      const now = Date.now();
      lastInteractionRef.current = now;
      if (onInteraction) onInteraction();
      if (onUserInteraction) onUserInteraction();
      touchPointsRef.current.push({ x: currentX, y: currentY, time: now });
      touchPointsRef.current = touchPointsRef.current.filter((point) => {
        return now - point.time < 100;
      });
    },
    [smoothSetScroll, onInteraction, onUserInteraction, clampPanToBounds, applyTransform, signalUserInteraction]
  );

  const handleMouseUp = useCallback(
    () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;

      if (mouseGestureModeRef.current === 'pan') {
        const points = touchPointsRef.current;
        if (points.length >= 2) {
          const firstPoint = points[0];
          const lastPoint = points[points.length - 1];
          const timeDiff = lastPoint.time - firstPoint.time;
          if (timeDiff > 0) {
            const velocityX = ((lastPoint.x - firstPoint.x) / timeDiff) * 16 * ZOOM_PAN_MOUSE_X_SENSITIVITY;
            const velocityY = ((lastPoint.y - firstPoint.y) / timeDiff) * 16 * ZOOM_PAN_MOUSE_Y_SENSITIVITY;
            startMomentum({ scrollY: 0, panX: velocityX, panY: velocityY });
          }
        }
        mouseGestureModeRef.current = 'none';
        touchPointsRef.current = [];
        if (restartAutoScrollRef.current) {
          restartAutoScrollRef.current();
        }
        return;
      }

      const points = touchPointsRef.current;
      if (points.length >= 2) {
        const firstPoint = points[0];
        const lastPoint = points[points.length - 1];
        const timeDiff = lastPoint.time - firstPoint.time;

        if (timeDiff > 0) {
          const distance = lastPoint.y - firstPoint.y;
          const velocity = -(distance / timeDiff) * 16;
          startMomentum({ scrollY: velocity });
        }
      }

      touchPointsRef.current = [];
      mouseGestureModeRef.current = 'none';
      if (restartAutoScrollRef.current) {
        restartAutoScrollRef.current();
      }
    },
    [startMomentum]
  );

  // Attach mousemove/mouseup on window so dragging works even outside the container
  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // ---- Mouse wheel handler ----
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        cancelMomentum();
        cancelSmoothScroll();
        signalUserInteraction();
        if (!canZoomFromTarget(e.target)) return;
        const factor = e.deltaY < 0 ? 1.08 : 0.92;
        const container = containerRef.current;
        if (container) {
          const bounds = container.getBoundingClientRect();
          queueZoomAtPoint(zoomScaleRef.current * factor, {
            x: e.clientX - bounds.left,
            y: e.clientY - bounds.top,
          });
        } else {
          setZoom(zoomScaleRef.current * factor);
        }
        return;
      }

      e.preventDefault();
      cancelMomentum();
      cancelSmoothScroll();
      signalUserInteraction();

      if (zoomScaleRef.current > 1.01) {
        panXRef.current -= e.deltaX * ZOOM_PAN_WHEEL_X_SENSITIVITY;
        panYRef.current -= e.deltaY * ZOOM_PAN_WHEEL_Y_SENSITIVITY;
        clampPanToBounds();
        applyTransform();
        return;
      }

      const newScrollY = scrollYRef.current + e.deltaY;
      smoothSetScroll(newScrollY);
    },
    [
      cancelMomentum,
      signalUserInteraction,
      setZoom,
      queueZoomAtPoint,
      canZoomFromTarget,
      smoothSetScroll,
      cancelSmoothScroll,
      clampPanToBounds,
      applyTransform,
    ]
  );

  // Attach wheel with { passive: false } so we can preventDefault
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container?.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  const startAutoScroll = useCallback(
    () => {
      if (!autoScroll) return;

      cancelAutoScroll();
      cancelSmoothScroll();

      const speedPerFrame = autoScrollSpeed / 60;
      const startDelay = Math.max(
        0,
        Number.isFinite(autoScrollStartDelayMs)
          ? Number(autoScrollStartDelayMs)
          : inactivityTimeout
      );

      const animate = () => {
        if (isTouchingRef.current || isDraggingRef.current || isPinchingRef.current) {
          autoScrollAnimationRef.current = requestAnimationFrame(animate);
          return;
        }
        if (momentumAnimationRef.current !== null) {
          autoScrollAnimationRef.current = requestAnimationFrame(animate);
          return;
        }
        if (zoomScaleRef.current > 1.01) {
          autoScrollAnimationRef.current = requestAnimationFrame(animate);
          return;
        }

        const timeSinceInteraction = Date.now() - lastInteractionRef.current;

        if (timeSinceInteraction >= startDelay) {
          let newScrollY = scrollYRef.current + speedPerFrame;
          const maxScroll = maxScrollYRef.current;
          let wrapped = false;

          if (maxScroll > 1 && newScrollY >= maxScroll) {
            newScrollY = 0;
            wrapped = true;
          }

          updateScroll(newScrollY);
          if (wrapped && onAutoScrollWrap) {
            onAutoScrollWrap();
          }
        }

        autoScrollAnimationRef.current = requestAnimationFrame(animate);
      };

      autoScrollAnimationRef.current = requestAnimationFrame(animate);
    },
    [autoScroll, autoScrollSpeed, inactivityTimeout, autoScrollStartDelayMs, cancelAutoScroll, updateScroll, cancelSmoothScroll, onAutoScrollWrap]
  );

  useEffect(() => {
    restartAutoScrollRef.current = startAutoScroll;
  }, [startAutoScroll]);

  useEffect(
    () => {
      const recalculate = () => {
        calculateMaxScroll();
        updateScroll(scrollYRef.current);
      };
      recalculate();

      const container = containerRef.current;
      const contentEl = contentRef.current;
      if (!container || !contentEl) return;

      const media = Array.from(contentEl.querySelectorAll('img, video'));
      const cleanupFns: Array<() => void> = [];
      media.forEach((node) => {
        const onLoad = () => { recalculate(); };
        node.addEventListener('load', onLoad);
        node.addEventListener('loadedmetadata', onLoad);
        cleanupFns.push(() => {
          node.removeEventListener('load', onLoad);
          node.removeEventListener('loadedmetadata', onLoad);
        });
      });

      let resizeObserver: ResizeObserver | null = null;
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          recalculate();
        });
        resizeObserver.observe(container);
        resizeObserver.observe(contentEl);
      }

      const resizeHandler = () => { recalculate(); };
      window.addEventListener('resize', resizeHandler);

      return () => {
        window.removeEventListener('resize', resizeHandler);
        cleanupFns.forEach((fn) => { fn(); });
        if (resizeObserver) resizeObserver.disconnect();
      };
    },
    [calculateMaxScroll, updateScroll, content]
  );

  useEffect(() => {
    lastJumpSectionIdRef.current = null;
    // Treat fresh content as ready for auto-scroll (document selection flow).
    lastInteractionRef.current = 0;
  }, [content]);

  useEffect(
    () => {
      startAutoScroll();

      return () => {
        cancelMomentum();
        cancelAutoScroll();
        if (resetAnimationRef.current !== null) {
          cancelAnimationFrame(resetAnimationRef.current);
          resetAnimationRef.current = null;
        }
        if (progressAnimationRef.current !== null) {
          cancelAnimationFrame(progressAnimationRef.current);
          progressAnimationRef.current = null;
        }
        if (zoomFrameRef.current !== null) {
          cancelAnimationFrame(zoomFrameRef.current);
          zoomFrameRef.current = null;
        }
        if (smoothScrollAnimationRef.current !== null) {
          cancelAnimationFrame(smoothScrollAnimationRef.current);
          smoothScrollAnimationRef.current = null;
        }
        isTouchingRef.current = false;
      };
    },
    [startAutoScroll, cancelMomentum, cancelAutoScroll]
  );

  useEffect(() => {
    if (!jumpToSectionId || !contentRef.current) return;
    if (lastJumpSectionIdRef.current === jumpToSectionId) return;

    const target = contentRef.current.querySelector(
      `[data-scroll-section-id="${jumpToSectionId.replace(/"/g, '\\"')}"]`
    ) as HTMLElement | null;
    if (!target) return;

    cancelMomentum();
    signalInteraction();
    updateScroll(target.offsetTop);
    lastJumpSectionIdRef.current = jumpToSectionId;
  }, [jumpToSectionId, updateScroll, cancelMomentum, signalInteraction]);

  useEffect(() => {
    if (!onActiveSectionChange || !contentRef.current || content.length === 0) return;

    const evaluateActiveSection = () => {
      const contentEl = contentRef.current;
      const containerEl = containerRef.current;
      if (!contentEl || !containerEl) return;

      const viewportCenterY = scrollYRef.current + containerEl.clientHeight / 2;
      const sections = contentEl.querySelectorAll<HTMLElement>('[data-scroll-section-id]');
      if (sections.length === 0) return;

      let bestId: string | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;

      sections.forEach((section) => {
        const sectionId = section.getAttribute('data-scroll-section-id');
        if (!sectionId) return;
        const top = section.offsetTop;
        const height = Math.max(1, section.offsetHeight);
        const center = top + height / 2;
        const distance = Math.abs(center - viewportCenterY);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestId = sectionId;
        }
      });

      if (bestId && lastActiveSectionIdRef.current !== bestId) {
        lastActiveSectionIdRef.current = bestId;
        onActiveSectionChange(bestId);
      }
    };

    evaluateActiveSection();
    const intervalId = window.setInterval(evaluateActiveSection, 80);
    return () => {
      clearInterval(intervalId);
    };
  }, [onActiveSectionChange, content.length]);

  // Reset to first frame (scroll to top) when idle and option is enabled
  useEffect(
    () => {
      if (!resetToFirstFrame || !isIdle) return;

      cancelMomentum();
      cancelAutoScroll();
      setZoom(1);
      if (resetAnimationRef.current !== null) {
        cancelAnimationFrame(resetAnimationRef.current);
        resetAnimationRef.current = null;
      }

      // Smooth scroll back to top
      const startY = scrollYRef.current;
      if (startY === 0) {
        startAutoScroll();
        return;
      }

      const duration = 800; // ms
      const startTime = Date.now();

      const animateReset = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const newY = startY * (1 - eased);
        updateScroll(newY);

        if (progress < 1) {
          resetAnimationRef.current = requestAnimationFrame(animateReset);
        } else {
          resetAnimationRef.current = null;
          startAutoScroll();
        }
      };

      resetAnimationRef.current = requestAnimationFrame(animateReset);

      return () => {
        if (resetAnimationRef.current !== null) {
          cancelAnimationFrame(resetAnimationRef.current);
          resetAnimationRef.current = null;
        }
      };
    },
    [isIdle, resetToFirstFrame, cancelMomentum, cancelAutoScroll, updateScroll, setZoom, startAutoScroll]
  );

  const getScrollProgress = useCallback(() => {
    const maxScroll = maxScrollYRef.current;
    if (maxScroll === 0) return 0;
    return scrollYRef.current / maxScroll;
  }, []);

  useEffect(
    () => {
      const updateProgress = () => {
        if (containerRef.current) {
          const progress = getScrollProgress();
          const progressBar = progressBarRef.current;
          if (progressBar) {
            const containerHeight = containerRef.current.clientHeight;
            const barHeight = containerHeight * 0.3;
            const maxTop = containerHeight - barHeight - 20;
            const top = 10 + progress * maxTop;
            progressBar.style.top = top + 'px';
          }
        }
        progressAnimationRef.current = requestAnimationFrame(updateProgress);
      };

      progressAnimationRef.current = requestAnimationFrame(updateProgress);

      return () => {
        if (progressAnimationRef.current !== null) {
          cancelAnimationFrame(progressAnimationRef.current);
          progressAnimationRef.current = null;
        }
      };
    },
    [getScrollProgress]
  );

  const renderSection = (section: ScrollSection) => {
    const baseStyle: CSSProperties = section.style || {};

    switch (section.type) {
      case 'heading':
        return (
          <div
            key={section.id}
            data-scroll-section-id={section.id}
            style={{
              backgroundColor: bgColor,
              color: '#fff',
              fontSize: '3rem',
              fontWeight: 'bold',
              textAlign: 'center',
              padding: '4rem 2rem',
              fontFamily: 'system-ui',
              ...baseStyle,
            }}
          >
            {renderAsteriskBold(section.content)}
          </div>
        );

      case 'text':
        return (
          <div
            key={section.id}
            data-scroll-section-id={section.id}
            style={{
              backgroundColor: bgColor,
              color: '#fff',
              fontSize: '1.25rem',
              lineHeight: '1.8',
              padding: '2rem',
              fontFamily: 'system-ui',
              ...baseStyle,
            }}
          >
            {renderAsteriskBold(section.content)}
          </div>
        );

      case 'image':
        return (
          <div
            key={section.id}
            data-scroll-section-id={section.id}
            style={{
              backgroundColor: bgColor,
              ...baseStyle,
            }}
          >
            <img
              src={section.content}
              alt={section.caption || ''}
              style={{
                width: '100%',
                height: 'auto',
                display: 'block',
                objectFit: mediaFit,
                objectPosition: 'center center',
              }}
            />
            {section.caption && (
              <div
                style={{
                  color: '#aaa',
                  fontSize: '1rem',
                  padding: '1rem 2rem',
                  fontFamily: 'system-ui',
                  fontStyle: 'italic',
                }}
              >
                {renderAsteriskBold(section.caption)}
              </div>
            )}
          </div>
        );

      case 'video':
        return (
          <div
            key={section.id}
            data-scroll-section-id={section.id}
            style={{
              backgroundColor: bgColor,
              width: '100%',
              height: 'var(--app-height, 100vh)',
              position: 'relative',
              ...baseStyle,
            }}
          >
            <VideoPlayer
              src={section.content}
              loop={true}
              autoPlay={true}
              muted={false}
              fit={mediaFit}
              backgroundColor={bgColor}
            />
            {section.caption && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '2rem',
                  left: '2rem',
                  right: '2rem',
                  color: '#fff',
                  fontSize: '1.25rem',
                  padding: '1rem',
                  backgroundColor: 'rgba(0, 0, 0, 0.7)',
                  fontFamily: 'system-ui',
                }}
              >
                {renderAsteriskBold(section.caption)}
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  const bgColor = backgroundColor || '#000';
  const mediaFit: 'cover' | 'contain' = fit === 'cover' || fit === 'contain'
    ? fit
    : 'contain';

  const containerStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: bgColor,
    touchAction: 'none',
    cursor: 'grab',
  };

  const contentStyle: CSSProperties = {
    width: '100%',
    transform: 'translate3d(0, 0, 0) scale(1)',
    transformOrigin: 'top left',
    willChange: 'transform',
    backfaceVisibility: 'hidden',
  };

  const progressBarStyle: CSSProperties = {
    position: 'absolute',
    right: '10px',
    top: '10px',
    width: '4px',
    height: '30%',
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: '2px',
    zIndex: 1000,
    transition: 'top 0.1s linear',
  };

  return (
    <div
      ref={containerRef}
      style={containerStyle}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onMouseDown={handleMouseDown}
    >
      <div ref={contentRef} style={contentStyle}>
        {content.map(renderSection)}
      </div>
      <div ref={progressBarRef} data-progress-bar style={progressBarStyle} />
    </div>
  );
}
