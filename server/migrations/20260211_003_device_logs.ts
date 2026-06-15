import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('device_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('device_id').notNullable().references('id').inTable('devices').onDelete('CASCADE');
    table.uuid('site_id').notNullable().references('id').inTable('sites').onDelete('CASCADE');
    table.string('level', 10).notNullable();
    table.text('message').notNullable();
    table.jsonb('context').defaultTo('{}');
    table.bigInteger('device_timestamp').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Indexes for common query patterns
  await knex.schema.alterTable('device_logs', (table) => {
    table.index('device_id', 'idx_device_logs_device_id');
    table.index('created_at', 'idx_device_logs_created_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('device_logs');
}
