'use client';

import { useEffect, useCallback } from 'react';

interface UseFullscreenOptions {
  /** Whether to request fullscreen on mount. Default: true */
  enabled?: boolean;
  /** Whether to prevent keyboard shortcuts. Default: true */
  preventKeyboard?: boolean;
  /** Whether to keep screen awake. Default: true */
  keepAwake?: boolean;
}

export function useFullscreen(options: UseFullscreenOptions = {}) {
  const {
    enabled = true,
    preventKeyboard = true,
    keepAwake = true,
  } = options;

  const requestFullscreen = useCallback(() => {
    const el = document.documentElement;
    // Try standard, then webkit prefix for older browsers
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    } else if ((el as any).webkitRequestFullscreen) {
      (el as any).webkitRequestFullscreen();
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Request fullscreen
    requestFullscreen();

    // Prevent context menu (disabled for dev — re-enable for production kiosk)
    const handleContextMenu = (_e: Event) => {
      // e.preventDefault();
    };

    // Prevent back/forward navigation
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
    };

    // Prevent keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!preventKeyboard) return;

      // Block F5 (refresh), F11, F12, etc.
      const blockedKeys = ['F5', 'F11', 'F12'];
      if (blockedKeys.indexOf(e.key) !== -1) {
        e.preventDefault();
        return;
      }
      if (e.ctrlKey && ['r', 'w', 'l', 'n', 't'].indexOf(e.key.toLowerCase()) !== -1) {
        e.preventDefault();
        return;
      }
      if (e.altKey && e.key === 'F4') {
        e.preventDefault();
        return;
      }
    };

    // Prevent drag
    const handleDragStart = (e: Event) => {
      e.preventDefault();
    };

    // Prevent double-tap zoom on touch devices
    let lastTouchEnd = 0;
    const handleTouchEnd = (e: TouchEvent) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    };

    // Push initial history state for popstate blocking
    window.history.pushState(null, '', window.location.href);

    // Add event listeners
    document.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('popstate', handlePopState);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('dragstart', handleDragStart);
    document.addEventListener('touchend', handleTouchEnd, { passive: false });

    // Screen wake lock
    let wakeLock: any = null;
    if (keepAwake && 'wakeLock' in navigator) {
      (navigator as any).wakeLock
        .request('screen')
        .then((lock: any) => {
          wakeLock = lock;
        })
        .catch(() => {
          // Wake Lock not supported or failed
        });
    }

    // Re-acquire wake lock on visibility change
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && keepAwake && 'wakeLock' in navigator) {
        // Release old lock before acquiring a new one to prevent resource leak
        if (wakeLock) {
          wakeLock.release().catch(() => {});
          wakeLock = null;
        }
        (navigator as any).wakeLock
          .request('screen')
          .then((lock: any) => {
            wakeLock = lock;
          })
          .catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('popstate', handlePopState);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('dragstart', handleDragStart);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLock) {
        wakeLock.release().catch(() => {});
      }
    };
  }, [enabled, preventKeyboard, keepAwake, requestFullscreen]);

  return { requestFullscreen };
}
