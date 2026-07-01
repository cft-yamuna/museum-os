import type { Knex } from 'knex';

/**
 * Rebrand "Museum OS" -> "Curato" for existing databases.
 * Migrations 016/017 set the old brand values; editing those files only
 * affects fresh databases, so this forward migration updates live data.
 */
export async function up(knex: Knex): Promise<void> {
  await knex('sites')
    .where({ name: 'Museum OS' })
    .update({ name: 'Curato' });

  await knex('users')
    .where({ email: 'admin@museumos.local' })
    .update({ email: 'admin@curato.local' });
}

export async function down(knex: Knex): Promise<void> {
  await knex('sites')
    .where({ name: 'Curato' })
    .update({ name: 'Museum OS' });

  await knex('users')
    .where({ email: 'admin@curato.local' })
    .update({ email: 'admin@museumos.local' });
}
