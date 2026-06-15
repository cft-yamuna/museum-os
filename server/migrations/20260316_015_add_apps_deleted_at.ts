import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('apps', (table) => {
    table.timestamp('deleted_at').nullable().defaultTo(null);
  });

  // Move existing soft-deleted apps (is_active=false) to use deleted_at
  await knex('apps')
    .where('is_active', false)
    .update({ deleted_at: knex.fn.now() });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('apps', (table) => {
    table.dropColumn('deleted_at');
  });
}
