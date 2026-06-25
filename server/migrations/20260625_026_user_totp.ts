import type { Knex } from 'knex';

/**
 * TOTP 2FA (curato-style) for admin users.
 *  - totp_secret: base32 secret, set during enrolment (null = not enrolled)
 *  - totp_enabled: only true once the user has verified a code, after which
 *    login requires a second factor.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.string('totp_secret', 64).nullable();
    table.boolean('totp_enabled').notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('totp_enabled');
    table.dropColumn('totp_secret');
  });
}
