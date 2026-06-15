import { getDb } from '../lib/db.js';

// In-memory LRU cache (max 1000 entries, 5-min TTL)
const cache = new Map<string, { revoked: boolean; cachedAt: number }>();
const CACHE_MAX = 1000;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function pruneCache(): void {
  if (cache.size <= CACHE_MAX) return;
  // Delete oldest entries
  const entries = [...cache.entries()].sort((a, b) => a[1].cachedAt - b[1].cachedAt);
  const toDelete = entries.slice(0, entries.length - CACHE_MAX);
  for (const [key] of toDelete) {
    cache.delete(key);
  }
}

export async function isTokenRevoked(jti: string): Promise<boolean> {
  // Check cache first
  const cached = cache.get(jti);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return cached.revoked;
  }

  // Check database
  const db = getDb();
  const row = await db('revoked_tokens').where({ jti }).first();
  const revoked = !!row;

  // Update cache
  cache.set(jti, { revoked, cachedAt: Date.now() });
  pruneCache();

  return revoked;
}

export async function revokeToken(jti: string, expiresAt: Date): Promise<void> {
  const db = getDb();
  try {
    await db('revoked_tokens').insert({
      jti,
      expires_at: expiresAt,
    });
  } catch (err: unknown) {
    // Ignore duplicate key (already revoked)
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      return;
    }
    throw err;
  }

  // Update cache
  cache.set(jti, { revoked: true, cachedAt: Date.now() });
  pruneCache();
}

export async function cleanupExpiredTokens(): Promise<number> {
  const db = getDb();
  const count = await db('revoked_tokens')
    .where('expires_at', '<', new Date())
    .del();
  return count;
}

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export function startTokenCleanup(): void {
  // Run cleanup every hour
  cleanupInterval = setInterval(async () => {
    try {
      const count = await cleanupExpiredTokens();
      if (count > 0) {
        console.log(`[TokenRevocation] Cleaned up ${count} expired tokens`);
      }
    } catch (err) {
      console.error('[TokenRevocation] Cleanup error:', err);
    }
  }, 60 * 60 * 1000);
}

export function stopTokenCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
