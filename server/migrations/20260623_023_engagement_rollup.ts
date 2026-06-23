import type { Knex } from 'knex';

/**
 * Hourly engagement rollup: one row per (site, zone, hour) pre-aggregating
 * interaction counts and presence sessions/dwell so the engagement dashboard
 * stays fast (O(zones x hours)) regardless of raw event volume. Recomputed
 * idempotently by the engagement aggregator via an ON CONFLICT upsert.
 *
 * The unique constraint uses NULLS NOT DISTINCT (PG15+) so the "no zone"
 * aggregate row (zone_id IS NULL) also upserts cleanly instead of inserting a
 * duplicate every run.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('engagement_rollup', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('site_id')
      .notNullable()
      .references('id')
      .inTable('sites')
      .onDelete('CASCADE');
    table.uuid('zone_id').nullable().references('id').inTable('device_groups').onDelete('CASCADE');
    table.timestamp('bucket').notNullable(); // date_trunc('hour', occurred_at)
    table.integer('interaction_count').notNullable().defaultTo(0);
    table.integer('presence_sessions').notNullable().defaultTo(0);
    table.bigInteger('dwell_seconds_sum').notNullable().defaultTo(0);
    table.timestamp('computed_at').notNullable().defaultTo(knex.fn.now());

    table.index(['site_id', 'bucket']);
  });

  await knex.raw(
    'ALTER TABLE engagement_rollup ADD CONSTRAINT engagement_rollup_site_zone_bucket_uniq ' +
      'UNIQUE NULLS NOT DISTINCT (site_id, zone_id, bucket)'
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('engagement_rollup');
}
