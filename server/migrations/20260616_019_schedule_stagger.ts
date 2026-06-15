import type { Knex } from 'knex';

/**
 * Staggered startup support for schedules.
 * stagger_seconds: gap (in seconds) inserted between each device when a power action
 * runs across multiple targets. Null/0 means fire all targets at once (legacy behaviour).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('schedules', (table) => {
    table.integer('stagger_seconds').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('schedules', (table) => {
    table.dropColumn('stagger_seconds');
  });
}
