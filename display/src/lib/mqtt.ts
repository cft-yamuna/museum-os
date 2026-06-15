'use client';

import mqtt from 'mqtt';
import type { MqttEvent } from './types';
import { config } from './config';

type MqttEventCallback = (event: MqttEvent) => void;
type MqttStateCallback = (connected: boolean) => void;

class MqttManager {
  private client: mqtt.MqttClient | null = null;
  private subscriptions: Map<string, Set<MqttEventCallback>> = new Map();
  private stateListeners: Set<MqttStateCallback> = new Set();
  private connected: boolean = false;
  private reconnectAttempts: number = 0;
  private refCount: number = 0;

  connect(): void {
    this.refCount = this.refCount + 1;

    if (this.client) {
      return;
    }

    const mqttUrl = config().mqttUrl;
    console.info('[MQTT] Connecting to', mqttUrl);

    try {
      this.client = mqtt.connect(mqttUrl, {
        reconnectPeriod: 5000,
        connectTimeout: 10000,
        keepalive: 30,
        clean: true,
        protocolVersion: 4,
      });

      this.client.on('connect', () => {
        console.info('[MQTT] Connected');
        this.connected = true;
        this.reconnectAttempts = 0;
        this.notifyState(true);

        // Re-subscribe to all active topics
        this.subscriptions.forEach((_callbacks, topic) => {
          this.client?.subscribe(topic, (err) => {
            if (err) {
              console.error('[MQTT] Re-subscribe failed for', topic, err);
            }
          });
        });
      });

      this.client.on('message', (_topic: string, message: { toString(): string }) => {
        try {
          const payload = JSON.parse(message.toString()) as MqttEvent;
          this.dispatch(payload);
        } catch (err) {
          console.error('[MQTT] Failed to parse message:', err);
        }
      });

      this.client.on('close', () => {
        console.info('[MQTT] Connection closed');
        this.connected = false;
        this.notifyState(false);
      });

      this.client.on('reconnect', () => {
        this.reconnectAttempts = this.reconnectAttempts + 1;
        console.info(`[MQTT] Reconnecting (attempt ${this.reconnectAttempts})`);
      });

      this.client.on('error', (err) => {
        console.error('[MQTT] Error:', err);
      });
    } catch (err) {
      console.error('[MQTT] Failed to create client:', err);
    }
  }

  disconnect(): void {
    this.refCount = Math.max(0, this.refCount - 1);

    if (this.refCount > 0) {
      return;
    }

    if (this.client) {
      try {
        this.client.end(true);
      } catch (_e) {
        // Ignore cleanup errors
      }
      this.client = null;
    }

    this.connected = false;
    this.reconnectAttempts = 0;
    this.notifyState(false);
  }

  subscribe(controllerId: string, callback: MqttEventCallback): void {
    const topic = `lightman/devices/${controllerId}/events`;
    let set = this.subscriptions.get(topic);

    if (!set) {
      set = new Set();
      this.subscriptions.set(topic, set);

      if (this.client && this.connected) {
        this.client.subscribe(topic, (err) => {
          if (err) {
            console.error('[MQTT] Subscribe failed for', topic, err);
          } else {
            console.info('[MQTT] Subscribed to', topic);
          }
        });
      }
    }

    set.add(callback);
  }

  unsubscribe(controllerId: string, callback: MqttEventCallback): void {
    const topic = `lightman/devices/${controllerId}/events`;
    const set = this.subscriptions.get(topic);

    if (set) {
      set.delete(callback);

      if (set.size === 0) {
        this.subscriptions.delete(topic);

        if (this.client && this.connected) {
          this.client.unsubscribe(topic, (err: Error | undefined) => {
            if (err) {
              console.error('[MQTT] Unsubscribe failed for', topic, err);
            }
          });
        }
      }
    }
  }

  onStateChange(callback: MqttStateCallback): void {
    this.stateListeners.add(callback);
  }

  offStateChange(callback: MqttStateCallback): void {
    this.stateListeners.delete(callback);
  }

  isConnected(): boolean {
    return this.connected;
  }

  private dispatch(event: MqttEvent): void {
    const topic = `lightman/devices/${event.controllerId}/events`;
    const listeners = this.subscriptions.get(topic);

    if (listeners) {
      listeners.forEach((cb) => {
        try {
          cb(event);
        } catch (err) {
          console.error('[MQTT] Error in event listener:', err);
        }
      });
    }
  }

  private notifyState(connected: boolean): void {
    this.stateListeners.forEach((cb) => {
      try {
        cb(connected);
      } catch (err) {
        console.error('[MQTT] Error in state listener:', err);
      }
    });
  }
}

// Singleton export
export const mqttManager = new MqttManager();
