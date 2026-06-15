import { useEffect, useRef } from 'react';

/**
 * Hook that listens for OSC trigger events from the local agent.
 * The agent receives OSC over UDP and broadcasts via ws://127.0.0.1:3402.
 *
 * Follows the same pattern as the local WebSocket path in useMonophone.
 */
export function useOscTrigger(opts: {
  enabled: boolean;
  onTrigger: () => void;
}) {
  const onTriggerRef = useRef(opts.onTrigger);
  onTriggerRef.current = opts.onTrigger;

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
              payload?: { type?: string };
            };
            if (msg.type !== 'hardware:event' || !msg.payload) return;
            if (msg.payload.type === 'osc:trigger') {
              onTriggerRef.current();
            }
          } catch { /* ignore */ }
        };
        ws.onclose = () => {
          if (!closed) setTimeout(connect, 2000);
        };
      } catch { /* ignore */ }
    }

    connect();
    return () => {
      closed = true;
      ws?.close();
    };
  }, [opts.enabled]);
}
