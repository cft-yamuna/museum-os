import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.boolean('must_change_password').notNullable().defaultTo(false);
  });

  // Set flag for the default admin user
  await knex('users')
    .where({ email: 'admin@hilight.local' })
    .update({ must_change_password: true });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('must_change_password');
  });
}
