import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Index on revoked_tokens.jti for fast lookup on every authenticated request.
  // jti is the primary key so it already has a unique index — use IF NOT EXISTS
  // to keep the migration idempotent-safe.
  await knex.raw(
    'CREATE INDEX IF NOT EXISTS idx_revoked_tokens_jti ON revoked_tokens(jti)'
  );

  // Composite index on device_logs(device_id, created_at DESC) for paginated queries.
  // Individual indexes on device_id and created_at already exist, but the composite
  // index with DESC ordering is required for efficient pagination by device.
  await knex.raw(
    'CREATE INDEX IF NOT EXISTS idx_device_logs_device_created ON device_logs(device_id, created_at DESC)'
  );

  // Index on content.created_by for filtered content listings.
  await knex.raw(
    'CREATE INDEX IF NOT EXISTS idx_content_created_by ON content(created_by)'
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_content_created_by');
  await knex.raw('DROP INDEX IF EXISTS idx_device_logs_device_created');
  await knex.raw('DROP INDEX IF EXISTS idx_revoked_tokens_jti');
}
