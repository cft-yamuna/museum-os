import type { Knex } from 'knex';
import { getDb } from '../lib/db.js';
import { pushToAdmins } from './adminWs.js';

/**
 * Power cascade: a child device depends on its parent (typically a player PC).
 * When the parent is powered off, children are marked 'unavailable' (a distinct,
 * non-fault state). When the parent powers on, children are reverted to 'offline'
 * so they can recover through their own heartbeat / agent reconnection.
 */

const CHILD_FIELDS = ['id', 'display_name', 'status', 'type', 'site_id'] as const;

export interface CascadeChild {
  id: string;
  display_name: string | null;
  status: string;
  type: string;
  site_id: string;
}

/** Return the direct children of a device. */
export async function getChildren(
  db: Knex,
  deviceId: string
): Promise<CascadeChild[]> {
  return db('devices')
    .where('parent_id', deviceId)
    .select(...CHILD_FIELDS);
}

/**
 * Apply the cascade after a parent device's power state changes.
 *
 * @param parentOnline true when the parent was just powered on, false when powered off.
 * @returns the ids of children whose status changed.
 */
export async function applyCascadeForParent(
  db: Knex,
  parentId: string,
  parentOnline: boolean
): Promise<string[]> {
  const children = await getChildren(db, parentId);
  if (children.length === 0) return [];

  // Parent off  -> children become 'unavailable' (only touch ones not already unavailable).
  // Parent on   -> children that were marked 'unavailable' revert to 'offline' to recover.
  const nextStatus = parentOnline ? 'offline' : 'unavailable';
  const matchStatus = parentOnline ? 'unavailable' : null;

  let query = db('devices').where('parent_id', parentId);
  if (matchStatus) {
    query = query.where('status', matchStatus);
  } else {
    // Powering off: don't clobber a child that is already 'unavailable'.
    query = query.whereNot('status', 'unavailable');
  }

  const affected: { id: string }[] = await query
    .update({ status: nextStatus, updated_at: db.fn.now() })
    .returning('id');

  const affectedIds = affected.map((r) => r.id);

  if (affectedIds.length > 0) {
    const siteId = children[0]?.site_id;
    pushToAdmins(
      {
        type: 'device:cascade',
        payload: {
          parentId,
          parentOnline,
          status: nextStatus,
          deviceIds: affectedIds,
        },
        timestamp: Date.now(),
      },
      siteId
    );
  }

  return affectedIds;
}

/**
 * Convenience wrapper that resolves its own DB handle.
 * Safe to call fire-and-forget from power handlers.
 */
export async function cascadePower(
  parentId: string,
  parentOnline: boolean
): Promise<string[]> {
  return applyCascadeForParent(getDb(), parentId, parentOnline);
}
