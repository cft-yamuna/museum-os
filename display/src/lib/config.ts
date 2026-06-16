export interface AppEnvironment {
  apiUrl: string;
  wsUrl: string;
  mqttUrl: string;
  deviceId: string;
  deviceApiKey: string;
  idleTimeout: number;
  heartbeatInterval: number;
  reconnectMaxDelay: number;
}

// localStorage keys — per-slug so multiple devices work in the same browser
const STORAGE_KEY_DEVICE_ID = 'museumos_device_id';
const STORAGE_KEY_API_KEY = 'museumos_api_key';

function getCurrentSlug(): string {
  if (typeof window === 'undefined') return '';
  const path = window.location.pathname;
  const prefix = '/display/';
  if (path.indexOf(prefix) === 0) {
    let slug = path.substring(prefix.length);
    if (slug.charAt(slug.length - 1) === '/') {
      slug = slug.substring(0, slug.length - 1);
    }
    return slug;
  }
  return '';
}

function storageKey(base: string): string {
  const slug = getCurrentSlug();
  if (slug) {
    return `${base}__${slug}`;
  }
  return base;
}

function getOrigin(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'http://localhost:3001';
}

export function getConfig(): AppEnvironment {
  const origin = getOrigin();
  const wsOrigin = origin.replace(/^http/, 'ws');

  return {
    apiUrl: `${origin}/api`,
    wsUrl: `${wsOrigin}/ws`,
    mqttUrl: `${wsOrigin.replace(/:\d+$/, '')}:1884`,
    deviceId: getStoredDeviceId() || '',
    deviceApiKey: getStoredApiKey() || '',
    idleTimeout: 300000,
    heartbeatInterval: 30000,
    reconnectMaxDelay: 30000,
  };
}

// Singleton for client-side usage
let _config: AppEnvironment | null = null;

export function config(): AppEnvironment {
  if (!_config) {
    _config = getConfig();
  }
  return _config;
}

// Reset the singleton (needed after provisioning sets new credentials)
export function resetConfig(): void {
  _config = null;
}

// ==========================================
// localStorage credential management
// ==========================================

export function getStoredDeviceId(): string | null {
  try {
    return localStorage.getItem(storageKey(STORAGE_KEY_DEVICE_ID));
  } catch (_e) {
    return null;
  }
}

export function getStoredApiKey(): string | null {
  try {
    return localStorage.getItem(storageKey(STORAGE_KEY_API_KEY));
  } catch (_e) {
    return null;
  }
}

export function hasCredentials(): boolean {
  const deviceId = getStoredDeviceId();
  const apiKey = getStoredApiKey();
  return Boolean(deviceId) && Boolean(apiKey);
}

export function initFromProvisioning(deviceId: string, apiKey: string): void {
  try {
    localStorage.setItem(storageKey(STORAGE_KEY_DEVICE_ID), deviceId);
    localStorage.setItem(storageKey(STORAGE_KEY_API_KEY), apiKey);
    resetConfig();
  } catch (e) {
    console.error('[Config] Failed to store credentials:', e);
  }
}

export function clearCredentials(): void {
  try {
    localStorage.removeItem(storageKey(STORAGE_KEY_DEVICE_ID));
    localStorage.removeItem(storageKey(STORAGE_KEY_API_KEY));
    resetConfig();
  } catch (_e) {
    // Silently fail
  }
}
