import { describe, it, expect } from 'vitest';
import { orderForStartup } from '../../services/scheduler.js';
import { applyCascadeForParent } from '../../services/powerCascade.js';
import { createMockKnex } from '../helpers/mockDb.js';

describe('orderForStartup', () => {
  it('orders parents before children, then by power_order, then by name', () => {
    const devices = [
      { id: 'c1', display_name: 'Zeta', parent_id: 'p1', power_order: null },
      { id: 'p2', display_name: 'PC B', parent_id: null, power_order: 2 },
      { id: 'p1', display_name: 'PC A', parent_id: null, power_order: 1 },
      { id: 'c2', display_name: 'Alpha', parent_id: 'p1', power_order: null },
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ordered = orderForStartup(devices as any);
    expect(ordered.map((d) => d.id)).toEqual(['p1', 'p2', 'c2', 'c1']);
  });

  it('falls back to name order when no parent/power_order is set', () => {
    const devices = [
      { id: 'b', display_name: 'Bravo', parent_id: null, power_order: null },
      { id: 'a', display_name: 'Alpha', parent_id: null, power_order: null },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ordered = orderForStartup(devices as any);
    expect(ordered.map((d) => d.id)).toEqual(['a', 'b']);
  });
});

describe('applyCascadeForParent', () => {
  it('marks children when the parent powers off', async () => {
    const db = createMockKnex();
    db._setTableData('devices', [
      { id: 'c1', display_name: 'D1', status: 'online', type: 'display', site_id: 's1' },
      { id: 'c2', display_name: 'D2', status: 'online', type: 'audio', site_id: 's1' },
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const affected = await applyCascadeForParent(db as any, 'p1', false);
    expect(affected.sort()).toEqual(['c1', 'c2']);
  });

  it('returns an empty list when the device has no children', async () => {
    const db = createMockKnex();
    db._setTableData('devices', []);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const affected = await applyCascadeForParent(db as any, 'p1', true);
    expect(affected).toEqual([]);
  });
});
