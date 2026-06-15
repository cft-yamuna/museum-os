import dgram from 'dgram';
import os from 'os';
import { env } from '../lib/env.js';

function normalizeIpv4Address(value: string): string | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,3})(\.\d{1,3}){3}$/);
  if (!match) {
    return null;
  }

  const parts = trimmed.split('.').map(Number);
  if (parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return null;
  }

  return parts.join('.');
}

function getConfiguredBroadcastAddresses(): string[] {
  if (!env.WOL_BROADCASTS) {
    return [];
  }

  return env.WOL_BROADCASTS
    .split(',')
    .map((value) => normalizeIpv4Address(value))
    .filter((value): value is string => !!value);
}

/**
 * Get all LAN broadcast addresses from active network interfaces.
 * This ensures WOL packets go out on the correct subnet.
 */
function getBroadcastAddresses(): string[] {
  const addresses = new Set<string>();
  const interfaces = os.networkInterfaces();

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    // Skip virtual/loopback adapters
    if (/virtual|hyper-v|wsl|loopback|veth/i.test(name)) continue;

    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        // Calculate broadcast address from IP and netmask
        const ipParts = addr.address.split('.').map(Number);
        const maskParts = addr.netmask.split('.').map(Number);
        const broadcast = ipParts.map((ip, i) => (ip | (~maskParts[i] & 255))).join('.');
        console.log(`[WOL] Found interface: ${name} (${addr.address}) -> broadcast ${broadcast}`);
        addresses.add(broadcast);
      }
    }
  }

  for (const address of getConfiguredBroadcastAddresses()) {
    console.log(`[WOL] Using configured broadcast: ${address}`);
    addresses.add(address);
  }

  addresses.add('255.255.255.255');
  return Array.from(addresses);
}

/**
 * Send a Wake-on-LAN magic packet to wake a device.
 *
 * Magic packet format: 6 bytes of 0xFF followed by the target MAC address repeated 16 times.
 * Sent as a UDP broadcast on port 9 to ALL active network interfaces.
 */
export async function sendWolPacket(mac: string): Promise<void> {
  // Normalize MAC: remove separators, validate
  const cleaned = mac.replace(/[:\-]/g, '').toLowerCase();
  if (!/^[0-9a-f]{12}$/.test(cleaned)) {
    throw new Error(`Invalid MAC address: ${mac}`);
  }

  // Build magic packet: 6x 0xFF + 16x MAC
  const macBytes = Buffer.from(cleaned, 'hex');
  const header = Buffer.alloc(6, 0xff);
  const body = Buffer.alloc(16 * 6);
  for (let i = 0; i < 16; i++) {
    macBytes.copy(body, i * 6);
  }
  const packet = Buffer.concat([header, body]);

  // Send to all broadcast addresses (covers all subnets)
  const broadcastAddresses = getBroadcastAddresses();
  console.log(`[WOL] Target MAC: ${mac}`);
  console.log(`[WOL] Broadcasting to: ${broadcastAddresses.join(', ')}`);

  const sendToAddress = (address: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4');

      socket.once('error', (err) => {
        socket.close();
        reject(err);
      });

      socket.bind(() => {
        socket.setBroadcast(true);
        // Send 3 times for reliability
        let sent = 0;
        const sendOnce = () => {
          socket.send(packet, 0, packet.length, env.WOL_PORT, address, (err) => {
            sent++;
            if (err) {
              socket.close();
              reject(err);
            } else if (sent < 3) {
              setTimeout(sendOnce, 100);
            } else {
              socket.close();
              resolve();
            }
          });
        };
        sendOnce();
      });
    });
  };

  await Promise.all(broadcastAddresses.map(sendToAddress));
}
