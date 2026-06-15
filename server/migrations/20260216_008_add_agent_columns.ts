import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('devices', (table) => {
    table.boolean('agent_connected').defaultTo(false);
    table.string('agent_version', 50).nullable();
    table.jsonb('last_health').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('devices', (table) => {
    table.dropColumn('agent_connected');
    table.dropColumn('agent_version');
    table.dropColumn('last_health');
  });
}
