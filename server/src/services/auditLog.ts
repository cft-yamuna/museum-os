import { getDb } from '../lib/db.js';

interface AuditEntry {
  userId?: string;
  siteId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Create an audit log entry.
 * Fire-and-forget: errors are logged but don't affect the caller.
 */
export function createAuditLog(entry: AuditEntry): void {
  const db = getDb();
  db('audit_logs')
    .insert({
      user_id: entry.userId || null,
      site_id: entry.siteId || null,
      action: entry.action,
      entity_type: entry.entityType || null,
      entity_id: entry.entityId || null,
      details: entry.details ? JSON.stringify(entry.details) : '{}',
      ip_address: entry.ipAddress || null,
    })
    .catch((err) => {
      console.error('[AuditLog] Failed to write audit entry:', err);
    });
}
