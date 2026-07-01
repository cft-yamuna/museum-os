'use client';

/**
 * IndexedDB-based cache for offline support.
 * Stores: device configs, app configs, playlists, content metadata.
 */

const DB_NAME = 'curato-cache';
const DB_VERSION = 1;

const STORES = {
  configs: 'configs',
  playlists: 'playlists',
  content: 'content',
  deviceConfig: 'deviceConfig',
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORES.configs)) db.createObjectStore(STORES.configs, { keyPath: 'instanceId' });
      if (!db.objectStoreNames.contains(STORES.playlists)) db.createObjectStore(STORES.playlists, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.content)) db.createObjectStore(STORES.content, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.deviceConfig)) db.createObjectStore(STORES.deviceConfig, { keyPath: 'deviceId' });
    };

    request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
    request.onerror = (event) => reject(new Error(`Failed to open IndexedDB: ${(event.target as IDBOpenDBRequest).error}`));
  });
}

function dbGet<T>(storeName: string, key: string): Promise<T | undefined> {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(new Error(`Failed to get from ${storeName}`));
  }));
}

function dbPut<T>(storeName: string, value: T): Promise<void> {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const request = tx.objectStore(storeName).put(value);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error(`Failed to put to ${storeName}`));
  }));
}

function dbDelete(storeName: string, key: string): Promise<void> {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const request = tx.objectStore(storeName).delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error(`Failed to delete from ${storeName}`));
  }));
}

export const cache = {
  getConfig: (instanceId: string) => dbGet(STORES.configs, instanceId),
  setConfig: (config: { instanceId: string; [key: string]: unknown }) => dbPut(STORES.configs, config),
  getPlaylist: (playlistId: string) => dbGet(STORES.playlists, playlistId),
  setPlaylist: (playlist: { id: string; [key: string]: unknown }) => dbPut(STORES.playlists, playlist),
  getContent: (contentId: string) => dbGet(STORES.content, contentId),
  setContent: (content: { id: string; [key: string]: unknown }) => dbPut(STORES.content, content),
  getDeviceConfig: (deviceId: string) => dbGet(STORES.deviceConfig, deviceId),
  setDeviceConfig: (config: { deviceId: string; [key: string]: unknown }) => dbPut(STORES.deviceConfig, config),
  deleteDeviceConfig: (deviceId: string) => dbDelete(STORES.deviceConfig, deviceId),
};
