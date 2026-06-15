'use client';

import { useEffect, useState, useCallback } from 'react';
import type { WSEvent } from '@/lib/types';
import { wsManager, type ConnectionState } from '@/lib/ws';

interface UseWebSocketOptions {
  deviceId: string;
  instanceId: string;
  templateType: string;
  enabled?: boolean;
}

interface UseWebSocketReturn {
  connectionState: ConnectionState;
  isConnected: boolean;
  send: (event: string, payload: unknown) => void;
  onEvent: (eventType: string, callback: (event: WSEvent) => void) => void;
  offEvent: (eventType: string, callback: (event: WSEvent) => void) => void;
}

export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const enabled = options.enabled ?? true;
  const { deviceId, instanceId, templateType } = options;

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');

  useEffect(() => {
    if (!enabled) return;

    wsManager.connect(deviceId, instanceId, templateType);

    const handleStateChange = (state: ConnectionState) => {
      setConnectionState(state);
    };
    wsManager.onStateChange(handleStateChange);

    return () => {
      wsManager.offStateChange(handleStateChange);
      wsManager.disconnect();
    };
  }, [deviceId, instanceId, templateType, enabled]);

  const send = useCallback((event: string, payload: unknown) => {
    wsManager.send(event, payload);
  }, []);

  const onEvent = useCallback((eventType: string, callback: (event: WSEvent) => void) => {
    wsManager.on(eventType, callback);
  }, []);

  const offEvent = useCallback((eventType: string, callback: (event: WSEvent) => void) => {
    wsManager.off(eventType, callback);
  }, []);

  return {
    connectionState,
    isConnected: connectionState === 'connected',
    send,
    onEvent,
    offEvent,
  };
}
