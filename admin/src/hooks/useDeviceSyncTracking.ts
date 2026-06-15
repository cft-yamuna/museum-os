import { useEffect, useMemo } from 'react';
import { adminWs } from '../lib/ws';
import { useDeviceSyncStore } from '../stores/deviceSync';

let bridgeRefCount = 0;
let detachBridge: (() => void) | null = null;

function extractPayload(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') {
    return {};
  }

  const event = data as { payload?: Record<string, unknown> } & Record<string, unknown>;
  if (event.payload && typeof event.payload === 'object') {
    return event.payload;
  }

  return event;
}

function attachBridge(): void {
  if (detachBridge) return;

  const unsubAgent = adminWs.on('agent:cache-refresh-result', (_event, data) => {
    useDeviceSyncStore.getState().handleAgentRefreshResult(extractPayload(data));
  });

  const unsubDisplay = adminWs.on('display:revision-rendered', (_event, data) => {
    useDeviceSyncStore.getState().handleDisplayRendered(extractPayload(data));
  });

  detachBridge = () => {
    unsubAgent();
    unsubDisplay();
    detachBridge = null;
  };
}

function retainBridge(): () => void {
  bridgeRefCount += 1;
  attachBridge();

  return () => {
    bridgeRefCount = Math.max(0, bridgeRefCount - 1);
    if (bridgeRefCount === 0 && detachBridge) {
      detachBridge();
    }
  };
}

export function useDeviceSyncTracking(deviceIds: string[]): void {
  const normalizedDeviceIds = useMemo(
    () => Array.from(new Set(deviceIds.filter(Boolean))).sort(),
    [deviceIds]
  );
  const deviceIdsKey = normalizedDeviceIds.join('|');

  useEffect(() => retainBridge(), []);

  useEffect(() => {
    const prune = () => {
      useDeviceSyncStore.getState().pruneStale();
    };

    prune();
    const timer = window.setInterval(prune, 10_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const ids = deviceIdsKey ? deviceIdsKey.split('|') : [];
    if (ids.length === 0) return;

    for (const deviceId of ids) {
      adminWs.send({ type: 'subscribe:device', payload: { deviceId } });
    }

    return () => {
      for (const deviceId of ids) {
        adminWs.send({ type: 'unsubscribe:device', payload: { deviceId } });
      }
    };
  }, [deviceIdsKey]);
}
