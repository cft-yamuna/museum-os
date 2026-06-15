import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add slug column
  await knex.schema.alterTable('devices', (table) => {
    table.string('slug', 100).unique().nullable();
  });

  // Backfill: generate slugs from display_name
  const devices = await knex('devices').select('id', 'display_name');
  for (const device of devices) {
    if (device.display_name) {
      const slug = device.display_name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      // Handle duplicates by appending a suffix
      let finalSlug = slug;
      let counter = 1;
      while (true) {
        const existing = await knex('devices')
          .where('slug', finalSlug)
          .whereNot('id', device.id)
          .first();
        if (!existing) break;
        finalSlug = slug + '-' + counter;
        counter++;
      }

      await knex('devices')
        .where('id', device.id)
        .update({ slug: finalSlug });
    }
  }

  // Add pairing_code and pairing_code_expires columns for provisioning
  await knex.schema.alterTable('devices', (table) => {
    table.string('pairing_code', 6).nullable();
    table.timestamp('pairing_code_expires').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('devices', (table) => {
    table.dropColumn('slug');
    table.dropColumn('pairing_code');
    table.dropColumn('pairing_code_expires');
  });
}
