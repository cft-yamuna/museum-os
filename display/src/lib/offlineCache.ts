// ==========================================
// Offline Cache Manager
// IndexedDB-based with in-memory fallback
// ==========================================

const DB_NAME = 'lightman-cache';
const STORE_NAME = 'entries';
const DB_VERSION = 1;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PREFIX = '[OfflineCache]';

// ==========================================
// Types
// ==========================================

interface CacheEntry {
  key: string;
  data: unknown;
  cachedAt: number;
  expiresAt: number;
}

// ==========================================
// In-memory fallback
// ==========================================

const memoryStore: { [key: string]: CacheEntry } = {};

function memoryGet(key: string): CacheEntry | null {
  const entry = memoryStore[key];
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    delete memoryStore[key];
    return null;
  }
  return entry;
}

function memorySet(key: string, data: unknown, ttlMs: number): void {
  const now = Date.now();
  memoryStore[key] = {
    key,
    data,
    cachedAt: now,
    expiresAt: now + ttlMs,
  };
}

function memoryRemove(key: string): void {
  delete memoryStore[key];
}

function memoryClear(): void {
  const keys = Object.keys(memoryStore);
  for (let i = 0; i < keys.length; i++) {
    delete memoryStore[keys[i]];
  }
}

function memoryHas(key: string): boolean {
  const entry = memoryStore[key];
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    delete memoryStore[key];
    return false;
  }
  return true;
}

// ==========================================
// IndexedDB helpers
// ==========================================

let _dbInstance: IDBDatabase | null = null;
let _dbFailed = false;

function isIDBAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch (_e) {
    return false;
  }
}

function openDB(): Promise<IDBDatabase> {
  if (_dbInstance) {
    return Promise.resolve(_dbInstance);
  }

  if (_dbFailed) {
    return Promise.reject(new Error('IndexedDB previously failed to open'));
  }

  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        _dbInstance = request.result;

        // Handle unexpected close
        _dbInstance.onclose = () => {
          _dbInstance = null;
        };

        resolve(_dbInstance);
      };

      request.onerror = () => {
        _dbFailed = true;
        console.warn(PREFIX, 'Failed to open IndexedDB, falling back to memory');
        reject(request.error);
      };
    } catch (e) {
      _dbFailed = true;
      console.warn(PREFIX, 'IndexedDB not available, falling back to memory');
      reject(e);
    }
  });
}

function idbGet(key: string): Promise<CacheEntry | null> {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(key);

        request.onsuccess = () => {
          const entry = request.result as CacheEntry | undefined;
          if (!entry) {
            resolve(null);
            return;
          }
          // Check expiration
          if (Date.now() > entry.expiresAt) {
            // Expired — remove in background, return null
            idbRemove(key).catch(() => { /* ignore cleanup errors */ });
            resolve(null);
            return;
          }
          resolve(entry);
        };

        request.onerror = () => {
          reject(request.error);
        };
      } catch (e) {
        reject(e);
      }
    });
  });
}

function idbSet(key: string, data: unknown, ttlMs: number): Promise<void> {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      try {
        const now = Date.now();
        const entry: CacheEntry = {
          key,
          data,
          cachedAt: now,
          expiresAt: now + ttlMs,
        };

        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.put(entry);

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          reject(request.error);
        };
      } catch (e) {
        reject(e);
      }
    });
  });
}

function idbRemove(key: string): Promise<void> {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.delete(key);

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          reject(request.error);
        };
      } catch (e) {
        reject(e);
      }
    });
  });
}

function idbClear(): Promise<void> {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          reject(request.error);
        };
      } catch (e) {
        reject(e);
      }
    });
  });
}

function idbHas(key: string): Promise<boolean> {
  return idbGet(key).then((entry) => entry !== null);
}

// ==========================================
// Public API — wraps IDB with memory fallback
// ==========================================

const offlineCache = {
  get: (key: string): Promise<unknown | null> => {
    if (!isIDBAvailable() || _dbFailed) {
      const entry = memoryGet(key);
      return Promise.resolve(entry ? entry.data : null);
    }

    return idbGet(key).then(
      (entry) => entry ? entry.data : null,
      (_err) => {
        console.warn(PREFIX, `IDB get failed for key "${key}", using memory fallback`);
        const fallback = memoryGet(key);
        return fallback ? fallback.data : null;
      }
    );
  },

  set: (key: string, data: unknown, ttlMs?: number): Promise<void> => {
    const ttl = ttlMs !== undefined ? ttlMs : DEFAULT_TTL_MS;

    // Always write to memory as backup
    memorySet(key, data, ttl);

    if (!isIDBAvailable() || _dbFailed) {
      return Promise.resolve();
    }

    return idbSet(key, data, ttl).then(
      () => { /* success */ },
      (_err) => {
        console.warn(PREFIX, `IDB set failed for key "${key}", stored in memory only`);
      }
    );
  },

  remove: (key: string): Promise<void> => {
    memoryRemove(key);

    if (!isIDBAvailable() || _dbFailed) {
      return Promise.resolve();
    }

    return idbRemove(key).then(
      () => { /* success */ },
      (_err) => {
        console.warn(PREFIX, `IDB remove failed for key "${key}"`);
      }
    );
  },

  clear: (): Promise<void> => {
    memoryClear();

    if (!isIDBAvailable() || _dbFailed) {
      return Promise.resolve();
    }

    return idbClear().then(
      () => { /* success */ },
      (_err) => {
        console.warn(PREFIX, 'IDB clear failed');
      }
    );
  },

  has: (key: string): Promise<boolean> => {
    if (!isIDBAvailable() || _dbFailed) {
      return Promise.resolve(memoryHas(key));
    }

    return idbHas(key).then(
      (exists) => exists,
      (_err) => {
        console.warn(PREFIX, `IDB has failed for key "${key}", using memory fallback`);
        return memoryHas(key);
      }
    );
  },
};

export { offlineCache };
export type { CacheEntry };
