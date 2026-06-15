import { useEffect, useRef, useState } from 'react';

/**
 * Hook that listens for presence sensor events from the local agent.
 * The agent reads the HLK-LD2410B sensor via USB serial and broadcasts
 * state changes via ws://127.0.0.1:3402 (LocalEventServer).
 *
 * Returns:
 *   isPresent       — true when a person is detected
 *   sensorConnected — true once any sensor event is received
 */
export function usePresenceSensor(opts: { enabled: boolean }): {
  isPresent: boolean;
  sensorConnected: boolean;
} {
  const [isPresent, setIsPresent] = useState(false);
  const [sensorConnected, setSensorConnected] = useState(false);

  // Track if we ever received an event (to distinguish "no sensor" from "sensor clear")
  const hasReceivedEvent = useRef(false);

  useEffect(() => {
    if (!opts.enabled) return;

    let ws: WebSocket | null = null;
    let closed = false;

    function connect() {
      try {
        ws = new WebSocket('ws://127.0.0.1:3402');
        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data) as {
              type?: string;
              payload?: { type?: string; state?: string };
            };
            if (msg.type !== 'hardware:event' || !msg.payload) return;

            const eventType = msg.payload.type;

            if (eventType === 'sensor:present') {
              hasReceivedEvent.current = true;
              setSensorConnected(true);
              setIsPresent(true);
            } else if (eventType === 'sensor:clear') {
              hasReceivedEvent.current = true;
              setSensorConnected(true);
              setIsPresent(false);
            } else if (eventType === 'sensor:ready') {
              hasReceivedEvent.current = true;
              setSensorConnected(true);
            } else if (eventType === 'sensor:disconnected') {
              setSensorConnected(false);
            }
          } catch { /* ignore parse errors */ }
        };
        ws.onclose = () => {
          if (!closed) setTimeout(connect, 2000);
        };
        ws.onerror = () => {
          // Silently retry — agent may not be running
        };
      } catch { /* ignore */ }
    }

    connect();
    return () => {
      closed = true;
      ws?.close();
    };
  }, [opts.enabled]);

  return { isPresent, sensorConnected };
}
