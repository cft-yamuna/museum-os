'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface PerformanceMetrics {
  timestamp: number;
  memoryMB: number | null;
  domNodes: number;
  fps: number;
  uptime: number;
}

export interface UsePerformanceMonitorOptions {
  enabled?: boolean;
  intervalMs?: number;
  onMetrics?: (metrics: PerformanceMetrics) => void;
}

/**
 * Lightweight performance monitor that periodically samples metrics.
 */
export function usePerformanceMonitor(
  options?: UsePerformanceMonitorOptions
): PerformanceMetrics | null {
  const enabled = options?.enabled ?? true;
  const intervalMs = options?.intervalMs ?? 60000;
  const onMetrics = options?.onMetrics ?? null;

  const mountTimeRef = useRef(Date.now());
  const fpsRef = useRef(0);
  const rafIdRef = useRef(0);
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onMetricsRef = useRef(onMetrics);

  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);

  onMetricsRef.current = onMetrics;

  const collectMetrics = useCallback((): PerformanceMetrics => {
    const perf = performance as any;
    const memoryMB = perf?.memory?.usedJSHeapSize
      ? Math.round(perf.memory.usedJSHeapSize / 1048576)
      : null;

    let domNodes = 0;
    try { domNodes = document.querySelectorAll('*').length; } catch { domNodes = -1; }

    return {
      timestamp: Date.now(),
      memoryMB,
      domNodes,
      fps: fpsRef.current,
      uptime: Math.round((Date.now() - mountTimeRef.current) / 1000),
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    lastFpsTimeRef.current = performance.now();
    frameCountRef.current = 0;

    const measureFrame = () => {
      frameCountRef.current++;
      const now = performance.now();
      const elapsed = now - lastFpsTimeRef.current;

      if (elapsed >= 1000) {
        fpsRef.current = Math.round((frameCountRef.current * 1000) / elapsed);
        frameCountRef.current = 0;
        lastFpsTimeRef.current = now;
      }

      rafIdRef.current = requestAnimationFrame(measureFrame);
    };

    rafIdRef.current = requestAnimationFrame(measureFrame);

    const tick = () => {
      const m = collectMetrics();
      setMetrics(m);

      const memStr = m.memoryMB !== null ? `${m.memoryMB}mb` : 'N/A';
      console.log(`[PerfMon] Memory: ${memStr}, DOM: ${m.domNodes} nodes, FPS: ${m.fps}, Uptime: ${m.uptime}s`);

      try { onMetricsRef.current?.(m); } catch { /* callback errors should not break the monitor */ }
    };

    const initialTimeout = setTimeout(tick, 2000);
    intervalRef.current = setInterval(tick, intervalMs);

    return () => {
      cancelAnimationFrame(rafIdRef.current);
      clearTimeout(initialTimeout);
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, intervalMs, collectMetrics]);

  return metrics;
}
