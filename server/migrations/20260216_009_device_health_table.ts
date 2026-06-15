import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('device_health', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.uuid('device_id').notNullable().references('id').inTable('devices').onDelete('CASCADE');
    table.float('cpu_usage').nullable();
    table.float('mem_percent').nullable();
    table.float('disk_percent').nullable();
    table.float('cpu_temp').nullable();
    table.float('uptime').nullable();
    table.timestamp('recorded_at').notNullable().defaultTo(knex.fn.now());

    table.index(['device_id', 'recorded_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('device_health');
}
