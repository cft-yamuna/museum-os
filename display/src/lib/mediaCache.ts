'use client';

/**
 * Cache API wrapper for offline media caching.
 * Caches images and video files currently in use.
 * Falls back gracefully if Cache API is not available.
 */

const CACHE_NAME = 'curato-media-v1';

function isCacheApiAvailable(): boolean {
  return typeof caches !== 'undefined';
}

/**
 * Cache a media URL for offline use.
 */
export async function cacheMedia(url: string): Promise<void> {
  if (!isCacheApiAvailable()) return;

  try {
    const c = await caches.open(CACHE_NAME);
    const existing = await c.match(url);
    if (!existing) {
      await c.add(url);
    }
  } catch (err) {
    // Silently fail - caching is best-effort
    if (import.meta.env.DEV) {
      console.warn('[MediaCache] Failed to cache:', url, err);
    }
  }
}

/**
 * Get a cached media response.
 * Returns undefined if not cached.
 */
export async function getCachedMedia(url: string): Promise<Response | undefined> {
  if (!isCacheApiAvailable()) return undefined;

  try {
    const c = await caches.open(CACHE_NAME);
    const response = await c.match(url);
    return response || undefined;
  } catch (err) {
    return undefined;
  }
}

/**
 * Remove a specific URL from the cache.
 */
export async function removeCachedMedia(url: string): Promise<void> {
  if (!isCacheApiAvailable()) return;

  try {
    const c = await caches.open(CACHE_NAME);
    await c.delete(url);
  } catch (err) {
    // Silently fail
  }
}

/**
 * Cache multiple URLs at once (e.g., preload next playlist items).
 */
export async function cacheMediaBatch(urls: string[]): Promise<void> {
  if (!isCacheApiAvailable()) return;

  const promises = urls.map((url) => cacheMedia(url));

  await Promise.all(promises).catch(() => {
    // Silently fail batch caching
  });
}

/**
 * Clear all cached media.
 */
export async function clearMediaCache(): Promise<void> {
  if (!isCacheApiAvailable()) return;

  try {
    await caches.delete(CACHE_NAME);
  } catch (err) {
    // Silently fail
  }
}

/**
 * Get approximate cache size (number of entries).
 */
export async function getMediaCacheSize(): Promise<number> {
  if (!isCacheApiAvailable()) return 0;

  try {
    const c = await caches.open(CACHE_NAME);
    const keys = await c.keys();
    return keys.length;
  } catch (err) {
    return 0;
  }
}
