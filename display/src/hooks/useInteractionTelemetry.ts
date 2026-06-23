'use client';

import { useCallback, useEffect, useRef } from 'react';
import { wsManager } from '../lib/ws';

/**
 * Lightweight visitor-interaction telemetry. Templates call the returned
 * `track(eventType, { target })` at semantic moments they already detect (a
 * category select, a screensaver tap) — this hook adds NO input listeners of
 * its own, so it never touches the render hot path or the GPU-tuned animation
 * loops.
 *
 * High-frequency event types (taps/swipes) are coalesced: the first fires
 * immediately (so the UI feels instant) and further events within a 1s window
 * are counted and flushed as a single message — bounding WS traffic to roughly
 * one message per second per event type. Discrete events send immediately.
 *
 * Keep the event-type strings in sync with the server taxonomy in
 * server/src/services/interactionEvents.ts (INTERACTION_EVENT_TYPES).
 */

const COALESCE_TYPES = new Set(['tap', 'carousel-swipe']);
const COALESCE_WINDOW_MS = 1000;

interface TrackOptions {
  target?: string;
}

interface CoalesceState {
  timer: ReturnType<typeof setTimeout> | null;
  pending: number;
  target?: string;
}

export type TrackFn = (eventType: string, opts?: TrackOptions) => void;

function emit(eventType: string, target: string | undefined, count?: number): void {
  wsManager.send('display:interaction', { eventType, target, count });
}

export function useInteractionTelemetry(): TrackFn {
  const statesRef = useRef<Map<string, CoalesceState>>(new Map());

  const flush = useCallback((eventType: string) => {
    const state = statesRef.current.get(eventType);
    if (!state) return;
    if (state.pending > 0) {
      emit(eventType, state.target, state.pending);
      state.pending = 0;
      // Keep the window open in case more events are still arriving.
      state.timer = setTimeout(() => flush(eventType), COALESCE_WINDOW_MS);
    } else {
      state.timer = null;
    }
  }, []);

  const track = useCallback<TrackFn>(
    (eventType, opts) => {
      if (COALESCE_TYPES.has(eventType)) {
        let state = statesRef.current.get(eventType);
        if (!state) {
          state = { timer: null, pending: 0 };
          statesRef.current.set(eventType, state);
        }
        state.target = opts?.target;
        if (state.timer === null) {
          // Leading edge — send immediately and open the coalescing window.
          emit(eventType, opts?.target, 1);
          state.timer = setTimeout(() => flush(eventType), COALESCE_WINDOW_MS);
        } else {
          // Within the window — cheap hot path, just count.
          state.pending += 1;
        }
      } else {
        emit(eventType, opts?.target);
      }
    },
    [flush]
  );

  // Flush any pending coalesced counts when the template unmounts.
  useEffect(() => {
    const states = statesRef.current;
    return () => {
      for (const [eventType, state] of states) {
        if (state.timer !== null) {
          clearTimeout(state.timer);
          state.timer = null;
        }
        if (state.pending > 0) {
          emit(eventType, state.target, state.pending);
          state.pending = 0;
        }
      }
    };
  }, []);

  return track;
}
