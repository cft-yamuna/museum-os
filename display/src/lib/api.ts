'use client';

import type {
  DeviceConfig,
  ContentItem,
  ContentVersion,
  Playlist,
  HeartbeatPayload,
  LogEntry,
  ApiResponse,
} from './types';
import { config } from './config';

// ==========================================
// Error Class
// ==========================================

export class ApiError extends Error {
  status: number;
  endpoint: string;

  constructor(message: string, status: number, endpoint: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.endpoint = endpoint;
  }
}

// ==========================================
// Internal Helpers
// ==========================================

const DEFAULT_TIMEOUT = 10000;
const MAX_RETRIES = 3;
const BACKOFF_BASE = 1000;

function getAuthHeaders(): Record<string, string> {
  const cfg = config();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${cfg.deviceApiKey}`,
  };
}

function getBaseUrl(): string {
  return config().apiUrl;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps a fetch call with a timeout using AbortController.
 * Note: any signal in options will be overridden by the internal timeout signal.
 */
export function fetchWithTimeout(url: string, options: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), ms);

  return fetch(url, { ...options, signal: controller.signal })
    .catch((err) => {
      if (err.name === 'AbortError') {
        throw new ApiError(`Request timed out after ${ms}ms`, 0, url);
      }
      throw err;
    })
    .finally(() => clearTimeout(timerId));
}

/**
 * Fetches a URL with retry logic and exponential backoff.
 */
async function fetchWithRetry<T>(
  endpoint: string,
  options: RequestInit,
  retries: number = MAX_RETRIES,
  timeout: number = DEFAULT_TIMEOUT
): Promise<T> {
  let lastError: Error = new Error('Request failed');

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetchWithTimeout(endpoint, options, timeout);

      if (!response.ok) {
        let errorBody = '';
        try {
          errorBody = await response.text();
        } catch {
          // ignore body parse failures
        }

        const apiError = new ApiError(
          `API request failed: ${response.status} ${errorBody || response.statusText}`,
          response.status,
          endpoint
        );

        // Do not retry 4xx client errors (except 408 and 429)
        if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
          throw apiError;
        }

        lastError = apiError;
      } else {
        let data: unknown;
        try {
          data = await response.json();
        } catch {
          throw new ApiError('Failed to parse JSON response', response.status, endpoint);
        }

        const apiResp = data as ApiResponse<T>;
        if (apiResp && typeof apiResp === 'object' && 'success' in apiResp && 'data' in apiResp) {
          if (!apiResp.success) {
            throw new ApiError(apiResp.error || 'API returned unsuccessful response', response.status, endpoint);
          }
          return apiResp.data;
        }

        return data as T;
      }
    } catch (error) {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429) {
        throw error;
      }
      if (error instanceof ApiError && error.message === 'Failed to parse JSON response') {
        throw error;
      }
      if (error instanceof ApiError && error.status >= 200 && error.status < 300) {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    if (attempt < retries - 1) {
      const backoffMs = BACKOFF_BASE * Math.pow(2, attempt);
      await delay(backoffMs);
    }
  }

  throw lastError;
}

// ==========================================
// API Functions
// ==========================================

export async function getDeviceConfig(deviceId: string): Promise<DeviceConfig> {
  const url = `${getBaseUrl()}/devices/${encodeURIComponent(deviceId)}/config`;
  return fetchWithRetry<DeviceConfig>(url, { method: 'GET', headers: getAuthHeaders() });
}

export async function getContent(contentId: string): Promise<ContentItem> {
  const url = `${getBaseUrl()}/content/${encodeURIComponent(contentId)}`;
  return fetchWithRetry<ContentItem>(url, { method: 'GET', headers: getAuthHeaders() });
}

export async function getContentVersions(contentId: string): Promise<ContentVersion[]> {
  const url = `${getBaseUrl()}/content/${encodeURIComponent(contentId)}/versions`;
  return fetchWithRetry<ContentVersion[]>(url, { method: 'GET', headers: getAuthHeaders() });
}

export async function getPlaylist(playlistId: string): Promise<Playlist> {
  const url = `${getBaseUrl()}/playlists/${encodeURIComponent(playlistId)}`;
  const raw = await fetchWithRetry<Record<string, unknown>>(url, { method: 'GET', headers: getAuthHeaders() });

  const rawItems = (raw.items as Array<Record<string, unknown>>) || [];
  const items = rawItems.map((item) => {
    const content = (item.content || {}) as Record<string, unknown>;
    const rawConfig = item.config;
    let itemConfig: Record<string, unknown> | null = null;
    if (rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig)) {
      itemConfig = rawConfig as Record<string, unknown>;
    } else if (typeof rawConfig === 'string') {
      try {
        const parsed = JSON.parse(rawConfig) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          itemConfig = parsed as Record<string, unknown>;
        }
      } catch {
        itemConfig = null;
      }
    }
    return {
      id: String(item.id || ''),
      type: (content.type || 'image') as 'image' | 'video',
      url: String(item.url || ''),
      duration: typeof item.duration === 'number' ? item.duration : undefined,
      metadata: itemConfig || undefined,
    };
  });
  return { id: String(raw.id || ''), name: String(raw.name || ''), items };
}

export async function sendHeartbeat(deviceId: string, payload: HeartbeatPayload): Promise<void> {
  const url = `${getBaseUrl()}/devices/${encodeURIComponent(deviceId)}/heartbeat`;
  await fetchWithRetry<void>(url, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(payload) });
}

export async function sendLog(deviceId: string, log: LogEntry): Promise<void> {
  const url = `${getBaseUrl()}/devices/${encodeURIComponent(deviceId)}/logs`;
  await fetchWithRetry<void>(url, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(log) });
}
