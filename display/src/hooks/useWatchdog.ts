'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface UseWatchdogOptions {
  enabled?: boolean;
  maxConsoleErrors?: number;
  memoryLimitMB?: number;
  healthCheckIntervalMs?: number;
  autoReloadOnCrash?: boolean;
}

interface UseWatchdogResult {
  errorCount: number;
  memoryMB: number;
  isHealthy: boolean;
}

const DEFAULT_MAX_ERRORS = 50;
const DEFAULT_MEMORY_LIMIT_MB = 180;
const DEFAULT_HEALTH_CHECK_INTERVAL = 30000;
const PREFIX = '[Watchdog]';

interface PerformanceWithMemory extends Performance {
  memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
}

function getMemoryMB(): number {
  try {
    const mem = (performance as PerformanceWithMemory).memory;
    if (mem) return Math.round(mem.usedJSHeapSize / (1024 * 1024));
  } catch { /* memory API not available */ }
  return 0;
}

function useWatchdog(options?: UseWatchdogOptions): UseWatchdogResult {
  const enabled = options?.enabled ?? true;
  const maxErrors = options?.maxConsoleErrors ?? DEFAULT_MAX_ERRORS;
  const memoryLimit = options?.memoryLimitMB ?? DEFAULT_MEMORY_LIMIT_MB;
  const checkInterval = options?.healthCheckIntervalMs ?? DEFAULT_HEALTH_CHECK_INTERVAL;
  const autoReload = options?.autoReloadOnCrash ?? true;

  const [errorCount, setErrorCount] = useState(0);
  const [memoryMB, setMemoryMB] = useState(getMemoryMB);
  const [isHealthy, setIsHealthy] = useState(true);

  const errorCountRef = useRef(0);
  const mountedRef = useRef(true);

  const triggerReload = useCallback((reason: string) => {
    if (!autoReload) {
      console.warn(PREFIX, 'Auto-reload disabled. Would reload due to:', reason);
      return;
    }
    console.warn(PREFIX, 'Reloading page:', reason);
    try { window.location.reload(); } catch { /* nothing more we can do */ }
  }, [autoReload]);

  useEffect(() => {
    if (!enabled) return;

    mountedRef.current = true;
    console.info(PREFIX, `Started monitoring (maxErrors=${maxErrors}, memoryLimitMB=${memoryLimit})`);

    const handleError = () => {
      errorCountRef.current++;
      const count = errorCountRef.current;
      console.warn(PREFIX, `Error captured (${count}/${maxErrors})`);
      if (mountedRef.current) setErrorCount(count);
      if (count >= maxErrors) triggerReload(`Error count exceeded threshold (${count}/${maxErrors})`);
    };

    const handleUnhandledRejection = () => {
      errorCountRef.current++;
      const count = errorCountRef.current;
      console.warn(PREFIX, `Unhandled rejection captured (${count}/${maxErrors})`);
      if (mountedRef.current) setErrorCount(count);
      if (count >= maxErrors) triggerReload(`Error count exceeded threshold after unhandled rejection (${count}/${maxErrors})`);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    const intervalId = setInterval(() => {
      if (!mountedRef.current) return;

      const mem = getMemoryMB();
      setMemoryMB(mem);

      let healthy = errorCountRef.current < maxErrors;
      if (mem > 0 && mem >= memoryLimit) healthy = false;
      setIsHealthy(healthy);

      if (mem > 0) {
        console.info(PREFIX, `Health check: memory=${mem}MB, errors=${errorCountRef.current}, healthy=${healthy}`);
      } else {
        console.info(PREFIX, `Health check: errors=${errorCountRef.current}, healthy=${healthy}`);
      }

      if (mem > 0 && mem >= memoryLimit) {
        triggerReload(`Memory limit exceeded (${mem}MB / ${memoryLimit}MB)`);
      }
    }, checkInterval);

    return () => {
      mountedRef.current = false;
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      clearInterval(intervalId);
      console.info(PREFIX, 'Stopped monitoring');
    };
  }, [enabled, maxErrors, memoryLimit, checkInterval, triggerReload]);

  return { errorCount, memoryMB, isHealthy };
}

export { useWatchdog };
export type { UseWatchdogOptions, UseWatchdogResult };
