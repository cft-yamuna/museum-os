'use client';

import { useEffect, useRef, useCallback } from 'react';
import { wsManager } from '@/lib/ws';
import type { WSEvent } from '@/lib/types';

interface UseExhibitSyncOptions {
  exhibitId: string;
  screenIndex: number;
  totalScreens: number;
  enabled: boolean;
}

interface ExhibitSyncState {
  action: string;
  data: Record<string, unknown>;
  timestamp: number;
  screenIndex: number;
}

interface UseExhibitSyncReturn {
  isLeader: boolean;
  lastSync: ExhibitSyncState | null;
  sendSync: (action: string, data: Record<string, unknown>) => void;
}

export function useExhibitSync(options: UseExhibitSyncOptions): UseExhibitSyncReturn {
  const { exhibitId, screenIndex, enabled } = options;

  const isLeader = screenIndex === 0;

  const lastSyncRef = useRef<ExhibitSyncState | null>(null);
  const syncHandlersRef = useRef<Set<(state: ExhibitSyncState) => void>>(new Set());

  // Send sync event (leader only)
  const sendSync = useCallback(
    (action: string, data: Record<string, unknown>) => {
      if (!enabled || !isLeader) return;

      const payload = {
        exhibitId,
        screenIndex,
        action,
        data,
        timestamp: Date.now(),
      };

      wsManager.send('exhibit:sync', payload);
    },
    [enabled, isLeader, exhibitId, screenIndex]
  );

  // Handle incoming sync events (followers only)
  useEffect(
    () => {
      if (!enabled || isLeader) return;

      const handleSync = (event: WSEvent) => {
        const payload = event.payload as {
          exhibitId?: string;
          screenIndex?: number;
          action?: string;
          data?: Record<string, unknown>;
          timestamp?: number;
        };

        // Filter for this exhibit only
        if (!payload || payload.exhibitId !== exhibitId) return;

        const syncState: ExhibitSyncState = {
          action: payload.action || '',
          data: payload.data || {},
          timestamp: payload.timestamp || Date.now(),
          screenIndex: payload.screenIndex || 0,
        };

        lastSyncRef.current = syncState;

        // Notify all registered handlers
        syncHandlersRef.current.forEach((handler) => {
          try {
            handler(syncState);
          } catch (err) {
            console.error('[ExhibitSync] Handler error:', err);
          }
        });
      };

      wsManager.on('exhibit:sync', handleSync);

      return () => {
        wsManager.off('exhibit:sync', handleSync);
      };
    },
    [enabled, isLeader, exhibitId]
  );

  return {
    isLeader,
    lastSync: lastSyncRef.current,
    sendSync,
  };
}

// Hook to subscribe to sync events
export function useExhibitSyncListener(
  callback: (state: ExhibitSyncState) => void,
  deps: unknown[]
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(
    () => {
      // This is a simplified listener registration
      // In practice, this would integrate with useExhibitSync's handler registry
      return () => {
        // Cleanup
      };
    },
    deps
  );
}
