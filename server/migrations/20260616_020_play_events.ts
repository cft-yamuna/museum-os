import type { Knex } from 'knex';

/**
 * Proof-of-play log: append-only record of what content/app played on which
 * device and when. Used for proof-of-play reporting and basic engagement.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('play_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('site_id')
      .notNullable()
      .references('id')
      .inTable('sites')
      .onDelete('CASCADE');
    table
      .uuid('device_id')
      .notNullable()
      .references('id')
      .inTable('devices')
      .onDelete('CASCADE');
    // App attribution (nullable: fallback/builder items may not map to an app).
    table.uuid('app_id').nullable().references('id').inTable('apps').onDelete('SET NULL');
    table.string('template_type', 64).nullable();
    // Content attribution — no FK so the log survives content/playlist deletion.
    table.uuid('content_id').nullable();
    table.uuid('playlist_id').nullable();
    table.string('title', 512).nullable();
    table.text('content_url').nullable();
    // 'app' (app revision shown) | 'slideshow' | 'fallback' | 'builder'
    table.string('source', 32).notNullable().defaultTo('app');
    table.integer('duration_sec').nullable();
    table.timestamp('played_at').notNullable().defaultTo(knex.fn.now());

    table.index(['site_id', 'played_at']);
    table.index(['device_id', 'played_at']);
    table.index(['content_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('play_events');
}
