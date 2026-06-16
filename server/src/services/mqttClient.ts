import mqtt from 'mqtt';
import { env } from '../lib/env.js';
import { getDb } from '../lib/db.js';
import { pushToAdmins } from './adminWs.js';

let client: mqtt.MqttClient | null = null;

interface HardwareEvent {
  type: 'monophone:pickup' | 'monophone:hangup' | 'button:press' | 'proximity:enter' | 'proximity:leave';
  controllerId: string;
  timestamp: number;
  buttonId?: number;
  distance?: number;
}

/**
 * Connect to MQTT broker and subscribe to hardware event topics.
 */
export function startMqttClient(): void {
  if (!env.MQTT_URL) {
    console.log('  MQTT:        skipped (no MQTT_URL)');
    return;
  }

  try {
    client = mqtt.connect(env.MQTT_URL, {
      clientId: `museumos-server-${Date.now()}`,
      clean: true,
      connectTimeout: 5000,
      reconnectPeriod: 5000,
    });

    client.on('connect', () => {
      console.log('  MQTT:        connected');
      // Subscribe to all device event topics
      client!.subscribe('museumos/devices/+/events', (err) => {
        if (err) {
          console.error('[MQTT] Subscribe error:', err);
        }
      });
    });

    client.on('message', (topic, message) => {
      try {
        handleMqttMessage(topic, message);
      } catch (err) {
        console.error('[MQTT] Message handling error:', err);
      }
    });

    client.on('error', (err) => {
      console.error('[MQTT] Connection error:', err.message);
    });

    client.on('offline', () => {
      console.warn('[MQTT] Broker offline, will retry...');
    });
  } catch (err) {
    console.error('[MQTT] Failed to initialize:', err);
  }
}

/**
 * Disconnect from MQTT broker.
 */
export function stopMqttClient(): void {
  if (client) {
    client.end(true);
    client = null;
  }
}

/**
 * Check if MQTT client is currently connected to the broker.
 */
export function isMqttConnected(): boolean {
  return client !== null && client.connected;
}

/**
 * Publish a command to an MQTT device (for future use).
 */
export function publishCommand(controllerId: string, command: Record<string, unknown>): void {
  if (!client || !client.connected) return;
  const topic = `museumos/devices/${controllerId}/commands`;
  client.publish(topic, JSON.stringify(command));
}

/**
 * Publish a hardware event to MQTT (used by serial bridge).
 * The display app subscribes to museumos/devices/{controllerId}/events
 * so publishing here makes serial-bridge events reach the display.
 */
export function publishEvent(controllerId: string, event: Record<string, unknown>): void {
  if (!client || !client.connected) {
    console.log(`[MQTT] Cannot publish event (not connected) — controllerId: ${controllerId}, type: ${event.type}`);
    return;
  }
  const topic = `museumos/devices/${controllerId}/events`;
  client.publish(topic, JSON.stringify(event));
  console.log(`[MQTT] Published ${event.type} to ${topic}`);
}

async function handleMqttMessage(topic: string, message: Buffer): Promise<void> {
  // Parse topic: museumos/devices/{controllerId}/events
  const parts = topic.split('/');
  if (parts.length !== 4 || parts[0] !== 'museumos' || parts[1] !== 'devices' || parts[3] !== 'events') {
    return;
  }

  const controllerId = parts[2];

  let event: HardwareEvent;
  try {
    event = JSON.parse(message.toString());
  } catch {
    console.error(`[MQTT] Invalid JSON from ${controllerId}`);
    return;
  }

  // Log the event
  console.log(`[MQTT] Hardware event: ${event.type} from ${controllerId}`);

  // Update controller last_seen in devices table (if it's tracked as a device)
  try {
    const db = getDb();
    await db('devices')
      .where({ mac_address: controllerId })
      .orWhere({ id: controllerId })
      .update({ last_seen: db.fn.now(), status: 'online' });
  } catch {
    // Controller might not be in devices table, that's OK
  }

  // Forward to admin UI via admin WebSocket
  // Get the site_id for this controller (if available)
  try {
    const db = getDb();
    const device = await db('devices')
      .where({ mac_address: controllerId })
      .orWhere({ id: controllerId })
      .select('site_id')
      .first();

    pushToAdmins({
      type: 'hardware:event',
      payload: {
        ...event,
        controllerId,
      },
      timestamp: Date.now(),
    }, device?.site_id);
  } catch {
    // Forward without site filtering if lookup fails
    pushToAdmins({
      type: 'hardware:event',
      payload: { ...event, controllerId },
      timestamp: Date.now(),
    });
  }
}
