'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ScheduleConfig } from '@/lib/types';

// ==========================================
// Types
// ==========================================

type IdleReason = 'no-content' | 'schedule' | 'command' | 'inactivity' | 'content-error';

interface UseIdleTimerOptions {
  /** Enable idle functionality */
  enabled: boolean;
  /** Schedule for active hours */
  schedule?: ScheduleConfig;
  /** Inactivity timeout in ms (for interactive apps). 0 = disabled */
  inactivityTimeout?: number;
  /** Whether content is currently available */
  hasContent?: boolean;
  /** Whether there's a content error */
  hasContentError?: boolean;
}

interface UseIdleTimerReturn {
  isIdle: boolean;
  idleReason: IdleReason | null;
  activate: () => void;
  deactivate: (reason?: IdleReason) => void;
  resetInactivityTimer: () => void;
}

// ==========================================
// Schedule helper
// ==========================================

function isWithinSchedule(sched: ScheduleConfig): boolean {
  try {
    const now = new Date();
    // Parse activeFrom and activeTo as HH:MM
    const fromParts = sched.activeFrom.split(':');
    const toParts = sched.activeTo.split(':');
    const fromMinutes = parseInt(fromParts[0], 10) * 60 + parseInt(fromParts[1], 10);
    const toMinutes = parseInt(toParts[0], 10) * 60 + parseInt(toParts[1], 10);

    // Get current time in minutes (simple approach - timezone handling is approximate)
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    if (fromMinutes <= toMinutes) {
      // Normal range (e.g., 09:00 to 18:00)
      return currentMinutes >= fromMinutes && currentMinutes < toMinutes;
    }
    // Overnight range (e.g., 22:00 to 06:00)
    return currentMinutes >= fromMinutes || currentMinutes < toMinutes;
  } catch (_e) {
    // If schedule parsing fails, assume active
    return true;
  }
}

// ==========================================
// Hook
// ==========================================

export function useIdleTimer(options: UseIdleTimerOptions): UseIdleTimerReturn {
  const {
    enabled,
    schedule,
    inactivityTimeout = 0,
    hasContent = true,
    hasContentError = false,
  } = options;

  const [isIdle, setIsIdle] = useState(false);
  const [idleReason, setIdleReason] = useState<IdleReason | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Manual activation (e.g., from WebSocket command:activate) ──

  const activate = useCallback(() => {
    setIsIdle(false);
    setIdleReason(null);
  }, []);

  // ─── Manual deactivation (e.g., from WebSocket command:idle) ────

  const deactivate = useCallback((reason?: IdleReason) => {
    setIsIdle(true);
    setIdleReason(reason || 'command');
  }, []);

  // ─── Reset inactivity timer (called on user interaction) ────────

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }

    if (isIdle && idleReason === 'inactivity') {
      activate();
    }

    if (inactivityTimeout > 0 && enabled) {
      inactivityTimerRef.current = setTimeout(() => {
        setIsIdle(true);
        setIdleReason('inactivity');
      }, inactivityTimeout);
    }
  }, [inactivityTimeout, enabled, isIdle, idleReason, activate]);

  // ─── No content → idle ─────────────────────────────────────────

  useEffect(() => {
    if (!enabled) return;

    if (!hasContent) {
      setIsIdle(true);
      setIdleReason('no-content');
    } else if (idleReason === 'no-content') {
      setIsIdle(false);
      setIdleReason(null);
    }
  }, [enabled, hasContent, idleReason]);

  // ─── Content error → idle ──────────────────────────────────────

  useEffect(() => {
    if (!enabled) return;

    if (hasContentError) {
      setIsIdle(true);
      setIdleReason('content-error');
    } else if (idleReason === 'content-error') {
      setIsIdle(false);
      setIdleReason(null);
    }
  }, [enabled, hasContentError, idleReason]);

  // ─── Schedule checking ─────────────────────────────────────────

  useEffect(() => {
    if (!enabled || !schedule) return;

    const checkSchedule = () => {
      const withinSchedule = isWithinSchedule(schedule!);
      if (!withinSchedule) {
        setIsIdle(true);
        setIdleReason('schedule');
      } else if (idleReason === 'schedule') {
        setIsIdle(false);
        setIdleReason(null);
      }
    };

    checkSchedule(); // Check immediately
    scheduleTimerRef.current = setInterval(checkSchedule, 60000); // Check every minute

    return () => {
      if (scheduleTimerRef.current) {
        clearInterval(scheduleTimerRef.current);
      }
    };
  }, [enabled, schedule, idleReason]);

  // ─── Inactivity timeout - touch/mouse/key listeners ────────────

  useEffect(() => {
    if (!enabled || inactivityTimeout <= 0) return;

    const handleInteraction = () => {
      resetInactivityTimer();
    };

    // Start the initial timer
    inactivityTimerRef.current = setTimeout(() => {
      setIsIdle(true);
      setIdleReason('inactivity');
    }, inactivityTimeout);

    // Listen for user interactions
    document.addEventListener('touchstart', handleInteraction);
    document.addEventListener('touchmove', handleInteraction);
    document.addEventListener('mousedown', handleInteraction);
    document.addEventListener('mousemove', handleInteraction);
    document.addEventListener('keydown', handleInteraction);

    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      document.removeEventListener('touchstart', handleInteraction);
      document.removeEventListener('touchmove', handleInteraction);
      document.removeEventListener('mousedown', handleInteraction);
      document.removeEventListener('mousemove', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
    };
  }, [enabled, inactivityTimeout, resetInactivityTimer]);

  // ─── Cleanup on unmount ────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      if (scheduleTimerRef.current) {
        clearInterval(scheduleTimerRef.current);
      }
    };
  }, []);

  // ─── Disabled state returns inert values ───────────────────────

  if (!enabled) {
    return {
      isIdle: false,
      idleReason: null,
      activate: () => {},
      deactivate: () => {},
      resetInactivityTimer: () => {},
    };
  }

  return { isIdle, idleReason, activate, deactivate, resetInactivityTimer };
}
