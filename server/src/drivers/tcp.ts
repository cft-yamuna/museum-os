import net from 'node:net';
import { DriverError } from './types.js';

export interface TcpRequestOpts {
  timeoutMs?: number;
  /** resolve once this byte sequence appears in the response */
  terminator?: Buffer;
  /** resolve once at least this many bytes have arrived */
  expectBytes?: number;
  /** for protocols that greet first (e.g. PJLink): wait for the greeting,
   *  then send the payload */
  preamble?: boolean;
}

/** One-shot TCP request/response helper with timeout. Ported from curato-v2. */
export function tcpRequest(
  host: string,
  port: number,
  payload: Buffer | string,
  opts: TcpRequestOpts = {},
): Promise<Buffer> {
  const { timeoutMs = 3000, terminator, preamble } = opts;
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let preambleSeen = !preamble;
    const sock = net.connect({ host, port });
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new DriverError(`timeout talking to ${host}:${port}`, 'timeout'));
    }, timeoutMs);
    const done = (buf: Buffer) => {
      clearTimeout(timer);
      sock.destroy();
      resolve(buf);
    };
    sock.on('connect', () => {
      if (!preamble) sock.write(data);
    });
    sock.on('data', (d) => {
      if (!preambleSeen) {
        preambleSeen = true;
        sock.write(data);
        return;
      }
      chunks.push(d);
      const all = Buffer.concat(chunks);
      if (terminator) {
        if (all.includes(terminator)) done(all);
      } else if (opts.expectBytes && all.length >= opts.expectBytes) {
        done(all);
      } else {
        setTimeout(() => done(Buffer.concat(chunks)), 60);
      }
    });
    sock.on('error', (e) => {
      clearTimeout(timer);
      reject(new DriverError(`${host}:${port} ${e.message}`, 'refused'));
    });
  });
}
