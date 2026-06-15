import { useEffect, useRef, useCallback } from 'react';

const DEFAULT_IDLE_TIMEOUT_MS = 20_000; // 20 seconds

/**
 * Resets to screensaver after idle timeout of no touch/pointer activity.
 * Only active when not already on the screensaver.
 */
export function useIdleTimeout(
  isScreensaver: boolean,
  onIdle: () => void,
  idleTimeoutMs: number = DEFAULT_IDLE_TIMEOUT_MS
) {
  const timerRef = useRef<number | null>(null);
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  const resetTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!isScreensaver) {
      timerRef.current = window.setTimeout(() => onIdleRef.current(), idleTimeoutMs);
    }
  }, [isScreensaver, idleTimeoutMs]);

  useEffect(() => {
    if (isScreensaver) {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // Start timer
    resetTimer();

    // Reset on any pointer activity
    const events = ['pointerdown', 'pointermove', 'pointerup'] as const;
    const handler = () => resetTimer();

    for (const event of events) {
      window.addEventListener(event, handler, { passive: true });
    }

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      for (const event of events) {
        window.removeEventListener(event, handler);
      }
    };
  }, [isScreensaver, resetTimer]);
}
