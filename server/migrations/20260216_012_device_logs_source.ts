import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('device_logs', (table) => {
    table.string('source', 20).defaultTo('display');
  });

  // Add index for source column filtering
  await knex.schema.alterTable('device_logs', (table) => {
    table.index('source', 'idx_device_logs_source');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('device_logs', (table) => {
    table.dropIndex('source', 'idx_device_logs_source');
    table.dropColumn('source');
  });
}
