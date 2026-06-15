'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { HeartbeatPayload } from '@/lib/types';
import { config } from '@/lib/config';
import { sendHeartbeat } from '@/lib/api';
import { wsManager } from '@/lib/ws';

interface UseHeartbeatOptions {
  deviceId: string;
  templateType?: string;
  instanceId?: string;
  enabled?: boolean;
}

export function useHeartbeat(options: UseHeartbeatOptions) {
  const { deviceId, templateType, instanceId, enabled = true } = options;
  const startTimeRef = useRef(Date.now());
  const statusRef = useRef<HeartbeatPayload['status']>('loading');
  const currentContentRef = useRef<string | undefined>(undefined);

  const setStatus = useCallback((status: HeartbeatPayload['status']) => {
    statusRef.current = status;
  }, []);

  const setCurrentContent = useCallback((contentId: string | undefined) => {
    currentContentRef.current = contentId;
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const getMemoryUsage = (): number | undefined => {
      const perf = performance as any;
      return perf?.memory?.usedJSHeapSize ?? undefined;
    };

    const buildPayload = (): HeartbeatPayload => ({
      deviceId,
      status: statusRef.current,
      currentContent: currentContentRef.current,
      templateType,
      uptime: Math.floor((Date.now() - startTimeRef.current) / 1000),
      memoryUsage: getMemoryUsage(),
      timestamp: Date.now(),
    });

    const doHeartbeat = () => {
      const payload = buildPayload();

      if (wsManager.getState() === 'connected') {
        wsManager.send('heartbeat', payload);
        return;
      }

      sendHeartbeat(deviceId, payload).catch((err) => {
        if (import.meta.env.DEV) {
          console.warn('[Heartbeat] Failed to send:', err);
        }
      });
    };

    doHeartbeat();
    const interval = setInterval(doHeartbeat, config().heartbeatInterval);

    return () => clearInterval(interval);
  }, [deviceId, templateType, instanceId, enabled]);

  return { setStatus, setCurrentContent };
}
