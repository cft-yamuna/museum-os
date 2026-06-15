/**
 * CUSTOM 07 — OSC Trigger App
 *
 * Listens for OSC signals via WebSocket bridge.
 * On trigger: plays a video. When video ends, returns to idle image.
 * Similar to monophone audio but triggered by OSC instead of COM/hardware.
 */

export interface OscTriggerConfig {
  instanceId: string;
  templateType: 'custom07-osc';
  deviceId: string;
  name?: string;

  // Input source
  inputSource: 'com' | 'osc';

  // OSC settings (when inputSource === 'osc')
  oscAddress?: string;           // OSC address pattern, e.g. "/b-av02"
  oscPort?: number;              // WebSocket port for OSC bridge, e.g. 8080
  oscHost?: string;              // OSC bridge host, default "127.0.0.1"

  // Content
  videoUrl?: string;             // video to play on trigger
  idleImageUrl?: string;         // image shown when idle

  // Idle screen
  idle?: {
    enabled: boolean;
    imageUrl?: string;
    videoUrl?: string;
    timeout?: number;
  };
}
