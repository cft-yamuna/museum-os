// Samsung MDC (Multiple Display Control) binary codec.
// Frame:  0xAA | cmd | id | len | data... | checksum
// checksum = (sum of every byte except the 0xAA header) & 0xFF
// Response: 0xAA | 0xFF | id | len | ack | rcmd | val... | checksum
//   ack = 'A' (0x41) ACK, 'N' (0x4E) NAK

export const MDC = {
  POWER: 0x11,
  VOLUME: 0x12,
  MUTE: 0x13,
  INPUT: 0x14,
} as const;

export function buildFrame(cmd: number, id: number, data: number[] = []): Buffer {
  const body = [cmd, id, data.length, ...data];
  const checksum = body.reduce((a, b) => a + b, 0) & 0xff;
  return Buffer.from([0xaa, ...body, checksum]);
}

export interface MdcResponse {
  ack: boolean;
  cmd: number;
  values: number[];
}

export function parseFrame(buf: Buffer): MdcResponse {
  // 0xAA 0xFF id len ack rcmd [vals...] checksum
  if (buf.length < 7 || buf[0] !== 0xaa) {
    throw new Error('malformed MDC response');
  }
  const len = buf[3];
  const ack = buf[4] === 0x41; // 'A'
  const cmd = buf[5];
  const values = Array.from(buf.subarray(6, 4 + len)); // data after ack+rcmd
  return { ack, cmd, values };
}
