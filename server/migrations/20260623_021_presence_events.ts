import type { Knex } from 'knex';

/**
 * Presence-sensor event log: append-only record of occupancy state changes
 * (Present/Clear) reported by the HLK-LD2410B sensor on each device. Used to
 * compute occupancy dwell time and approach counts for visitor-engagement
 * analytics. zone_id is snapshotted at write time so historical attribution
 * stays stable even if a device is later moved to a different zone.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('presence_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('site_id')
      .notNullable()
      .references('id')
      .inTable('sites')
      .onDelete('CASCADE');
    table
      .uuid('device_id')
      .notNullable()
      .references('id')
      .inTable('devices')
      .onDelete('CASCADE');
    // Zone attribution snapshotted at ingest (no FK-follow on membership change).
    table.uuid('zone_id').nullable().references('id').inTable('device_groups').onDelete('SET NULL');
    // 'present' | 'clear'
    table.string('state', 16).notNullable();
    table.timestamp('occurred_at').notNullable().defaultTo(knex.fn.now());

    table.index(['site_id', 'occurred_at']);
    table.index(['device_id', 'occurred_at']);
    table.index(['zone_id', 'occurred_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('presence_events');
}
