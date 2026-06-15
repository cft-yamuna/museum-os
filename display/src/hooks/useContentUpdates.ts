'use client';

import { useEffect, useRef } from 'react';
import type { WSEvent, WSContentUpdated, WSPlaylistUpdated, WSConfigUpdated, AnyAppConfig } from '@/lib/types';
import type { LocalDisplayEvent } from '@/lib/localEvents';
import { wsManager } from '@/lib/ws';
import { localEventManager } from '@/lib/localEvents';

interface UseContentUpdatesOptions {
  enabled?: boolean;
  onContentUpdated?: (contentId: string, newUrl: string) => void;
  onPlaylistUpdated?: (playlistId: string) => void;
  onConfigUpdated?: (config: AnyAppConfig) => void;
}

export function useContentUpdates(options: UseContentUpdatesOptions) {
  const { enabled = true, onContentUpdated, onPlaylistUpdated, onConfigUpdated } = options;

  const onContentUpdatedRef = useRef(onContentUpdated);
  const onPlaylistUpdatedRef = useRef(onPlaylistUpdated);
  const onConfigUpdatedRef = useRef(onConfigUpdated);

  // Keep refs current
  useEffect(() => {
    onContentUpdatedRef.current = onContentUpdated;
    onPlaylistUpdatedRef.current = onPlaylistUpdated;
    onConfigUpdatedRef.current = onConfigUpdated;
  });

  useEffect(() => {
    if (!enabled) return;

    const handleContentUpdated = (event: { payload: unknown }) => {
      const payload = event.payload as WSContentUpdated;
      if (onContentUpdatedRef.current && payload?.contentId && payload?.newUrl) {
        onContentUpdatedRef.current(payload.contentId, payload.newUrl);
      }
    };

    const handlePlaylistUpdated = (event: { payload: unknown }) => {
      const payload = event.payload as WSPlaylistUpdated;
      if (onPlaylistUpdatedRef.current && payload?.playlistId) {
        onPlaylistUpdatedRef.current(payload.playlistId);
      }
    };

    const handleConfigUpdated = (event: { payload: unknown }) => {
      const payload = event.payload as WSConfigUpdated;
      if (onConfigUpdatedRef.current && payload?.config) {
        onConfigUpdatedRef.current(payload.config);
      }
    };

    const handleLocalConfigUpdated = (event: LocalDisplayEvent) => {
      const payload = (event.payload || {}) as {
        assignedApp?: { config?: AnyAppConfig };
      };
      if (onConfigUpdatedRef.current && payload.assignedApp?.config) {
        onConfigUpdatedRef.current(payload.assignedApp.config);
      }
    };

    wsManager.on('content:updated', handleContentUpdated as (event: WSEvent) => void);
    wsManager.on('playlist:updated', handlePlaylistUpdated as (event: WSEvent) => void);
    wsManager.on('config:updated', handleConfigUpdated as (event: WSEvent) => void);
    localEventManager.on('content:updated', handleContentUpdated);
    localEventManager.on('playlist:updated', handlePlaylistUpdated);
    localEventManager.on('config:updated', handleLocalConfigUpdated);

    return () => {
      wsManager.off('content:updated', handleContentUpdated as (event: WSEvent) => void);
      wsManager.off('playlist:updated', handlePlaylistUpdated as (event: WSEvent) => void);
      wsManager.off('config:updated', handleConfigUpdated as (event: WSEvent) => void);
      localEventManager.off('content:updated', handleContentUpdated);
      localEventManager.off('playlist:updated', handlePlaylistUpdated);
      localEventManager.off('config:updated', handleLocalConfigUpdated);
    };
  }, [enabled]);
}
