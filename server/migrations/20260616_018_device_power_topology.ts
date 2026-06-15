import type { Knex } from 'knex';

/**
 * Power topology for cascade + staggered startup.
 *  - parent_id: self-reference. A child device (display/audio/sensor) depends on its
 *    parent (typically a player PC). When the parent powers off, children are marked
 *    'unavailable'; when the parent powers on, children revert to 'offline' and recover
 *    via their own heartbeat/agent.
 *  - power_order: optional ordering hint used when building a staggered startup sequence.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('devices', (table) => {
    table
      .uuid('parent_id')
      .nullable()
      .references('id')
      .inTable('devices')
      .onDelete('SET NULL');
    table.integer('power_order').nullable();

    table.index('parent_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('devices', (table) => {
    table.dropIndex('parent_id');
    table.dropColumn('power_order');
    table.dropColumn('parent_id');
  });
}
