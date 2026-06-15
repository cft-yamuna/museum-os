import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('agent_versions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.text('filename').notNullable();
    table.text('version').notNullable();
    table.text('platform').defaultTo('linux');
    table.text('checksum').notNullable();
    table.bigInteger('file_size').notNullable();
    table.uuid('uploaded_by').references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('agent_versions');
}
