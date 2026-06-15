'use client';

import type { LogEntry, LogLevel } from './types';
import { config } from './config';

interface LoggerOptions {
  deviceId: string;
  templateType?: string;
  instanceId?: string;
  maxBufferSize?: number;  // max entries before force-flush, default: 50
  flushInterval?: number;  // ms between flushes, default: 10000
}

class Logger {
  private buffer: LogEntry[] = [];
  private options: LoggerOptions | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isFlushing: boolean = false;

  init(options: LoggerOptions): void {
    this.options = options;
    this.startFlushTimer();
    this.setupGlobalHandlers();
  }

  destroy(): void {
    this.stopFlushTimer();
    this.removeGlobalHandlers();
    this.flush(); // Send remaining logs
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level,
      message,
      context: {
        ...context,
        deviceId: this.options?.deviceId ?? 'unknown',
        templateType: this.options?.templateType,
        instanceId: this.options?.instanceId,
      },
      timestamp: Date.now(),
    };

    // Console output (always in dev, errors always)
    if (import.meta.env.DEV || level === 'error') {
      const consoleFn = level === 'error' ? console.error
        : level === 'warn' ? console.warn
        : level === 'debug' ? console.debug
        : console.log;
      consoleFn(`[Museum OS ${level.toUpperCase()}]`, message, context || '');
    }

    this.buffer.push(entry);

    // Force flush if buffer is full
    const maxSize = this.options?.maxBufferSize ?? 50;
    if (this.buffer.length >= maxSize) {
      this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.isFlushing || this.buffer.length === 0 || !this.options) return;

    this.isFlushing = true;
    const entries = this.buffer.splice(0, this.buffer.length);

    try {
      const cfg = config();
      const response = await fetch(
        `${cfg.apiUrl}/devices/${this.options.deviceId}/logs`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cfg.deviceApiKey}`,
          },
          body: JSON.stringify({ entries }),
        }
      );

      if (!response.ok) {
        // Put entries back in buffer for next attempt
        this.buffer = entries.concat(this.buffer);
      }
    } catch (err) {
      // Server unreachable - put entries back
      this.buffer = entries.concat(this.buffer);
      // Trim buffer to prevent memory issues during extended offline
      if (this.buffer.length > 200) {
        this.buffer = this.buffer.slice(-200);
      }
    } finally {
      this.isFlushing = false;
    }
  }

  private startFlushTimer(): void {
    const interval = this.options?.flushInterval ?? 10000;
    this.flushTimer = setInterval(() => {
      this.flush();
    }, interval);
  }

  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private onWindowError = (event: ErrorEvent): void => {
    this.error(`Unhandled error: ${event.message}`, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  };

  private onUnhandledRejection = (event: PromiseRejectionEvent): void => {
    const reason = event.reason;
    let message = 'Unhandled promise rejection';
    if (reason instanceof Error) {
      message = `${message}: ${reason.message}`;
    } else if (typeof reason === 'string') {
      message = `${message}: ${reason}`;
    }
    this.error(message);
  };

  private setupGlobalHandlers(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('error', this.onWindowError);
    window.addEventListener('unhandledrejection', this.onUnhandledRejection);
  }

  private removeGlobalHandlers(): void {
    if (typeof window === 'undefined') return;
    window.removeEventListener('error', this.onWindowError);
    window.removeEventListener('unhandledrejection', this.onUnhandledRejection);
  }
}

// Singleton export
export const logger = new Logger();
