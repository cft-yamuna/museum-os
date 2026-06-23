import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../lib/db.js', () => ({ getDb: vi.fn() }));

import { getDb } from '../../lib/db.js';
import { recordInteractionEvent } from '../../services/interactionEvents.js';
import { recordPresenceEvent } from '../../services/presenceEvents.js';
import { clearZoneCache } from '../../services/zoneResolver.js';

/**
 * Build a minimal chainable DB mock that resolves a device's zone and captures
 * inserted rows per table, so we can assert the recorders' field-mapping logic
 * (taxonomy coercion, UUID guarding, truncation, zone stamping) in isolation.
 */
function makeDb(opts?: { zoneId?: string | null; failInsert?: boolean }) {
  const inserts: Record<string, Array<Record<string, unknown>>> = {};
  const zoneRow = opts?.zoneId ? { zone_id: opts.zoneId } : undefined;

  const db: any = (table: string) => {
    if (table === 'device_group_members') {
      const b: any = { join: () => b, where: () => b, first: async () => zoneRow };
      return b;
    }
    return {
      insert: async (row: Record<string, unknown>) => {
        if (opts?.failInsert) throw new Error('db down');
        (inserts[table] ||= []).push(row);
      },
    };
  };
  db._inserts = inserts;
  return db;
}

describe('recordInteractionEvent', () => {
  beforeEach(() => {
    clearZoneCache();
  });

  it('coerces unknown event types to "other"', async () => {
    const db = makeDb();
    vi.mocked(getDb).mockReturnValue(db as any);
    await recordInteractionEvent({ siteId: 's', deviceId: 'd', eventType: 'totally-bogus' });
    expect(db._inserts['interaction_events']).toHaveLength(1);
    expect(db._inserts['interaction_events'][0].event_type).toBe('other');
  });

  it('keeps known event types', async () => {
    const db = makeDb();
    vi.mocked(getDb).mockReturnValue(db as any);
    await recordInteractionEvent({ siteId: 's', deviceId: 'd', eventType: 'navigate' });
    expect(db._inserts['interaction_events'][0].event_type).toBe('navigate');
  });

  it('drops a non-UUID app_id but keeps a valid one', async () => {
    const db = makeDb();
    vi.mocked(getDb).mockReturnValue(db as any);
    const uuid = '11111111-2222-3333-4444-555555555555';
    await recordInteractionEvent({ siteId: 's', deviceId: 'd', eventType: 'tap', appId: 'nope' });
    await recordInteractionEvent({ siteId: 's', deviceId: 'd', eventType: 'tap', appId: uuid });
    expect(db._inserts['interaction_events'][0].app_id).toBeNull();
    expect(db._inserts['interaction_events'][1].app_id).toBe(uuid);
  });

  it('truncates an over-long target to 128 chars', async () => {
    const db = makeDb();
    vi.mocked(getDb).mockReturnValue(db as any);
    await recordInteractionEvent({ siteId: 's', deviceId: 'd', eventType: 'tap', target: 'x'.repeat(200) });
    expect((db._inserts['interaction_events'][0].target as string).length).toBe(128);
  });

  it('stamps the resolved zone_id', async () => {
    const db = makeDb({ zoneId: 'z-1' });
    vi.mocked(getDb).mockReturnValue(db as any);
    await recordInteractionEvent({ siteId: 's', deviceId: 'd', eventType: 'tap' });
    expect(db._inserts['interaction_events'][0].zone_id).toBe('z-1');
  });

  it('never throws when the insert fails', async () => {
    vi.mocked(getDb).mockReturnValue(makeDb({ failInsert: true }) as any);
    await expect(
      recordInteractionEvent({ siteId: 's', deviceId: 'd', eventType: 'tap' })
    ).resolves.toBeUndefined();
  });
});

describe('recordPresenceEvent', () => {
  beforeEach(() => {
    clearZoneCache();
  });

  it('records a present transition with zone attribution', async () => {
    const db = makeDb({ zoneId: 'z-2' });
    vi.mocked(getDb).mockReturnValue(db as any);
    await recordPresenceEvent({ siteId: 's', deviceId: 'd', state: 'present' });
    expect(db._inserts['presence_events']).toHaveLength(1);
    expect(db._inserts['presence_events'][0].state).toBe('present');
    expect(db._inserts['presence_events'][0].zone_id).toBe('z-2');
  });

  it('ignores states other than present/clear', async () => {
    const db = makeDb();
    vi.mocked(getDb).mockReturnValue(db as any);
    await recordPresenceEvent({ siteId: 's', deviceId: 'd', state: 'ready' as unknown as 'present' });
    expect(db._inserts['presence_events']).toBeUndefined();
  });
});
