import type { Knex } from 'knex';

/**
 * Removes three retired features:
 *   - Exhibitions  (exhibitions + exhibition_assignments tables)
 *   - Floor Map    (floors table + devices floor/position columns)
 *   - Proof of Play (play_events table)
 *
 * Playlists and the visitor-engagement analytics are intentionally kept.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('play_events');
  await knex.schema.dropTableIfExists('exhibition_assignments');
  await knex.schema.dropTableIfExists('exhibitions');

  const hasFloorId = await knex.schema.hasColumn('devices', 'floor_id');
  const hasX = await knex.schema.hasColumn('devices', 'x_position');
  const hasY = await knex.schema.hasColumn('devices', 'y_position');
  if (hasFloorId || hasX || hasY) {
    await knex.schema.alterTable('devices', (table) => {
      // Dropping floor_id also drops its FK to floors.
      if (hasFloorId) table.dropColumn('floor_id');
      if (hasX) table.dropColumn('x_position');
      if (hasY) table.dropColumn('y_position');
    });
  }

  await knex.schema.dropTableIfExists('floors');
}

export async function down(knex: Knex): Promise<void> {
  // Recreate floors first so the devices.floor_id FK can reference it.
  await knex.schema.createTable('floors', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('site_id').notNullable().references('id').inTable('sites').onDelete('CASCADE');
    table.string('name', 255).notNullable();
    table.integer('level');
    table.string('background_image', 500);
    table.integer('width');
    table.integer('height');
    table.jsonb('config').defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.alterTable('devices', (table) => {
    table.uuid('floor_id').references('id').inTable('floors').onDelete('SET NULL');
    table.integer('x_position');
    table.integer('y_position');
  });

  await knex.schema.createTable('exhibitions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('site_id').notNullable().references('id').inTable('sites').onDelete('CASCADE');
    table.string('name', 255).notNullable();
    table.text('description');
    table.date('start_date');
    table.date('end_date');
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('exhibition_assignments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('exhibition_id').notNullable().references('id').inTable('exhibitions').onDelete('CASCADE');
    table.uuid('device_id').notNullable().references('id').inTable('devices').onDelete('CASCADE');
    table.uuid('content_id').references('id').inTable('content');
    table.uuid('playlist_id').references('id').inTable('playlists');
    table.jsonb('config').defaultTo('{}');
  });

  await knex.raw(`
    ALTER TABLE exhibition_assignments
    ADD CONSTRAINT chk_content_or_playlist
    CHECK (content_id IS NOT NULL OR playlist_id IS NOT NULL)
  `);

  await knex.schema.createTable('play_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('site_id').notNullable().references('id').inTable('sites').onDelete('CASCADE');
    table.uuid('device_id').notNullable().references('id').inTable('devices').onDelete('CASCADE');
    table.uuid('app_id').nullable().references('id').inTable('apps').onDelete('SET NULL');
    table.string('template_type', 64).nullable();
    table.uuid('content_id').nullable();
    table.uuid('playlist_id').nullable();
    table.string('title', 512).nullable();
    table.text('content_url').nullable();
    table.string('source', 32).notNullable().defaultTo('app');
    table.integer('duration_sec').nullable();
    table.timestamp('played_at').notNullable().defaultTo(knex.fn.now());

    table.index(['site_id', 'played_at']);
    table.index(['device_id', 'played_at']);
    table.index(['content_id']);
  });
}
