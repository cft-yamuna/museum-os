import type { Knex } from 'knex';

/**
 * Interaction event log: append-only record of visitor touch interactions
 * (taps, navigation, button presses, etc.) reported by display templates.
 * Parallel to play_events; used for per-exhibit interaction counts and zone
 * heatmaps in visitor-engagement analytics. zone_id is snapshotted at ingest.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('interaction_events', (table) => {
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
    table.uuid('zone_id').nullable().references('id').inTable('device_groups').onDelete('SET NULL');
    // App attribution (nullable: fallback/builder content may not map to an app).
    table.uuid('app_id').nullable().references('id').inTable('apps').onDelete('SET NULL');
    table.string('template_type', 64).nullable();
    // Bounded taxonomy: tap | navigate | button-press | carousel-swipe |
    // screensaver-wake | monophone-pickup | poi-open | idle-reset | other
    table.string('event_type', 32).notNullable();
    // Optional semantic target (category/gallery/POI id or button label).
    table.string('target', 128).nullable();
    table.timestamp('occurred_at').notNullable().defaultTo(knex.fn.now());

    table.index(['site_id', 'occurred_at']);
    table.index(['device_id', 'occurred_at']);
    table.index(['zone_id', 'occurred_at']);
    table.index(['app_id']);
    table.index(['event_type']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('interaction_events');
}
