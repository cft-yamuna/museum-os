import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('revoked_tokens', (t) => {
    t.string('jti').primary();
    t.timestamp('expires_at').notNullable();
    t.timestamp('revoked_at').notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('revoked_tokens');
}
