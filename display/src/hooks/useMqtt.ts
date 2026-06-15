'use client';

import { useEffect, useState, useRef } from 'react';
import { mqttManager } from '@/lib/mqtt';
import type { MqttEvent, MqttEventType } from '@/lib/types';

interface UseMqttOptions {
  controllerId: string;
  enabled?: boolean;
}

interface UseMqttResult {
  isConnected: boolean;
  lastEvent: MqttEvent | null;
}

export function useMqtt(options: UseMqttOptions): UseMqttResult {
  const { controllerId } = options;
  const enabled = options.enabled ?? true;

  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<MqttEvent | null>(null);
  const callbacksRef = useRef<Map<MqttEventType, Array<Function>>>(new Map());

  useEffect(
    () => {
      if (!enabled || !controllerId) return;

      mqttManager.connect();

      const stateHandler = (connected: boolean) => {
        setIsConnected(connected);
      };

      const eventHandler = (event: MqttEvent) => {
        setLastEvent(event);

        // Dispatch to registered type-specific callbacks
        const handlers = callbacksRef.current.get(event.type);
        if (handlers) {
          handlers.forEach((cb) => {
            try {
              if (event.type === 'button:press' && event.buttonId !== undefined) {
                cb(event.buttonId);
              } else if (event.type === 'proximity:enter' && event.distance !== undefined) {
                cb(event.distance);
              } else {
                cb();
              }
            } catch (err) {
              console.error('[useMqtt] Callback error:', err);
            }
          });
        }
      };

      mqttManager.onStateChange(stateHandler);
      mqttManager.subscribe(controllerId, eventHandler);

      setIsConnected(mqttManager.isConnected());

      return () => {
        mqttManager.offStateChange(stateHandler);
        mqttManager.unsubscribe(controllerId, eventHandler);
        mqttManager.disconnect();
      };
    },
    [controllerId, enabled]
  );

  return { isConnected, lastEvent };
}

// ==========================================
// Convenience hooks for specific hardware
// ==========================================

interface UseMonophoneOptions {
  controllerId: string;
  enabled?: boolean;
  debounceMs?: number;
}

interface UseMonophoneResult {
  isPickedUp: boolean;
  isConnected: boolean;
}

export function useMonophone(options: UseMonophoneOptions): UseMonophoneResult {
  const { controllerId } = options;
  const enabled = options.enabled ?? true;
  const debounceMs = options.debounceMs || 200;

  const [isPickedUp, setIsPickedUp] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceRef = useRef(debounceMs);
  debounceRef.current = debounceMs;
  const mqtt = useMqtt({ controllerId, enabled });

  const applyPickupStateRef = useRef((newState: boolean) => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      setIsPickedUp(newState);
      debounceTimerRef.current = null;
    }, debounceRef.current);
  });

  // MQTT path
  useEffect(
    () => {
      if (!mqtt.lastEvent) return;
      const event = mqtt.lastEvent;
      if (event.type === 'monophone:pickup' || event.type === 'monophone:hangup') {
        applyPickupStateRef.current(event.type === 'monophone:pickup');
      }
      return () => {
        if (debounceTimerRef.current !== null) {
          clearTimeout(debounceTimerRef.current);
        }
      };
    },
    [mqtt.lastEvent]
  );

  // Local agent WebSocket path — direct from agent on this device (no server round-trip)
  useEffect(
    () => {
      if (!enabled) return;

      let ws: WebSocket | null = null;
      let closed = false;

      const connect = () => {
        try {
          ws = new WebSocket('ws://127.0.0.1:3402');
          ws.onmessage = (e) => {
            try {
              const msg = JSON.parse(e.data) as { type?: string; payload?: { type?: string; controllerId?: string } };
              if (msg.type !== 'hardware:event' || !msg.payload) return;
              if (controllerId && msg.payload.controllerId && msg.payload.controllerId !== controllerId) return;
              if (msg.payload.type === 'monophone:pickup') applyPickupStateRef.current(true);
              else if (msg.payload.type === 'monophone:hangup') applyPickupStateRef.current(false);
            } catch (_e) { /* ignore */ }
          };
          ws.onclose = () => {
            if (!closed) setTimeout(connect, 2000);
          };
        } catch (_e) { /* ignore */ }
      };

      connect();
      return () => {
        closed = true;
        ws?.close();
      };
    },
    [controllerId, enabled]
  );

  return { isPickedUp, isConnected: mqtt.isConnected };
}

interface UseButtonPanelOptions {
  controllerId: string;
  enabled?: boolean;
}

interface UseButtonPanelResult {
  lastButtonId: number | null;
  lastPressTime: number;
  isConnected: boolean;
}

export function useButtonPanel(options: UseButtonPanelOptions): UseButtonPanelResult {
  const { controllerId } = options;
  const enabled = options.enabled ?? true;

  const [lastButtonId, setLastButtonId] = useState<number | null>(null);
  const [lastPressTime, setLastPressTime] = useState(0);
  const mqtt = useMqtt({ controllerId, enabled });

  useEffect(
    () => {
      if (!mqtt.lastEvent) return;

      const event = mqtt.lastEvent;

      if (event.type === 'button:press' && event.buttonId !== undefined) {
        setLastButtonId(event.buttonId);
        setLastPressTime(event.timestamp);
      }
    },
    [mqtt.lastEvent]
  );

  return {
    lastButtonId,
    lastPressTime,
    isConnected: mqtt.isConnected,
  };
}

interface UseProximityOptions {
  controllerId: string;
  enabled?: boolean;
  activationDistance?: number;
  deactivationDelay?: number;
}

interface UseProximityResult {
  isPresent: boolean;
  distance: number | null;
  isConnected: boolean;
}

export function useProximity(options: UseProximityOptions): UseProximityResult {
  const { controllerId } = options;
  const enabled = options.enabled ?? true;
  const activationDistance = options.activationDistance || 100;
  const deactivationDelay = options.deactivationDelay || 3000;

  const [isPresent, setIsPresent] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mqtt = useMqtt({ controllerId, enabled });

  useEffect(
    () => {
      if (!mqtt.lastEvent) return;

      const event = mqtt.lastEvent;

      if (event.type === 'proximity:enter') {
        const dist = event.distance ?? 0;
        setDistance(dist);

        if (dist <= activationDistance) {
          if (leaveTimerRef.current !== null) {
            clearTimeout(leaveTimerRef.current);
            leaveTimerRef.current = null;
          }
          setIsPresent(true);
        }
      } else if (event.type === 'proximity:leave') {
        setDistance(null);

        if (leaveTimerRef.current !== null) {
          clearTimeout(leaveTimerRef.current);
        }

        leaveTimerRef.current = setTimeout(() => {
          setIsPresent(false);
          leaveTimerRef.current = null;
        }, deactivationDelay);
      }
    },
    [mqtt.lastEvent, activationDistance, deactivationDelay]
  );

  // Cleanup leave timer on unmount
  useEffect(() => {
    return () => {
      if (leaveTimerRef.current !== null) {
        clearTimeout(leaveTimerRef.current);
      }
    };
  }, []);

  return {
    isPresent,
    distance,
    isConnected: mqtt.isConnected,
  };
}
