import { getDb } from '../lib/db.js';

/**
 * Periodically rolls up raw presence/interaction events into the hourly
 * engagement_rollup table and prunes old raw data. Structural sibling of
 * healthAggregator: 5-minute interval, recompute the last couple hours of
 * buckets idempotently (ON CONFLICT upsert), then enforce retention.
 */

const ROLLUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
const RAW_TTL_DAYS = 90; // engagement raw events kept for quarterly reporting
const ROLLUP_TTL_DAYS = 395; // rollup kept ~13 months for year-over-year trends

let timer: NodeJS.Timeout | null = null;

/**
 * Recompute engagement_rollup for buckets touched in the last 2 hours.
 *
 * Sessions = a 'present' paired with the next 'clear' for the same device
 * (LEAD over occurred_at), capped at 30 minutes to drop stuck/abandoned
 * sessions. The presence subquery looks back 3 hours so a present near the
 * window's leading edge can still be paired with its later clear, while only
 * presents whose bucket falls in the last 2 hours are counted. Counts are
 * absolute (= EXCLUDED, not +=) so re-running is idempotent.
 *
 * NULLS NOT DISTINCT on the unique constraint lets the no-zone aggregate row
 * (zone_id IS NULL) upsert instead of duplicating.
 */
const ROLLUP_SQL = `
INSERT INTO engagement_rollup
  (site_id, zone_id, bucket, interaction_count, presence_sessions, dwell_seconds_sum, computed_at)
SELECT
  COALESCE(i.site_id, p.site_id),
  COALESCE(i.zone_id, p.zone_id),
  COALESCE(i.bucket, p.bucket),
  COALESCE(i.cnt, 0),
  COALESCE(p.sessions, 0),
  COALESCE(p.dwell, 0),
  now()
FROM (
  SELECT site_id, zone_id, date_trunc('hour', occurred_at) AS bucket, count(*) AS cnt
  FROM interaction_events
  WHERE occurred_at >= date_trunc('hour', now()) - interval '2 hours'
  GROUP BY site_id, zone_id, date_trunc('hour', occurred_at)
) i
FULL OUTER JOIN (
  SELECT site_id, zone_id, date_trunc('hour', occurred_at) AS bucket,
         count(*) AS sessions,
         sum(EXTRACT(EPOCH FROM (next_at - occurred_at)))::bigint AS dwell
  FROM (
    SELECT site_id, zone_id, state, occurred_at,
           LEAD(occurred_at) OVER (PARTITION BY device_id ORDER BY occurred_at) AS next_at,
           LEAD(state) OVER (PARTITION BY device_id ORDER BY occurred_at) AS next_state
    FROM presence_events
    WHERE occurred_at >= date_trunc('hour', now()) - interval '3 hours'
  ) t
  WHERE t.state = 'present' AND t.next_state = 'clear'
    AND t.next_at - t.occurred_at <= interval '30 minutes'
    AND t.occurred_at >= date_trunc('hour', now()) - interval '2 hours'
  GROUP BY site_id, zone_id, date_trunc('hour', occurred_at)
) p
  ON i.site_id = p.site_id
  AND i.bucket = p.bucket
  AND i.zone_id IS NOT DISTINCT FROM p.zone_id
ON CONFLICT (site_id, zone_id, bucket)
DO UPDATE SET
  interaction_count = EXCLUDED.interaction_count,
  presence_sessions = EXCLUDED.presence_sessions,
  dwell_seconds_sum = EXCLUDED.dwell_seconds_sum,
  computed_at = now();
`;

export function startEngagementAggregator(): void {
  if (timer) return;

  // First rollup after a short delay so agents/displays can connect first.
  setTimeout(() => {
    runRollup().catch((err) =>
      console.error('[EngagementAggregator] Initial rollup error:', err)
    );
  }, 30_000);

  timer = setInterval(() => {
    runRollup().catch((err) => console.error('[EngagementAggregator] Rollup error:', err));
  }, ROLLUP_INTERVAL);

  console.log('  Engagement:  aggregator (5m rollup, 90d raw TTL)');
}

export function stopEngagementAggregator(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function runRollup(): Promise<void> {
  const db = getDb();

  await db.raw(ROLLUP_SQL);

  // Retention: prune raw events (90d) and stale rollup buckets (~13mo).
  const presenceDeleted = await db('presence_events')
    .where('occurred_at', '<', db.raw(`now() - interval '${RAW_TTL_DAYS} days'`))
    .del();
  const interactionDeleted = await db('interaction_events')
    .where('occurred_at', '<', db.raw(`now() - interval '${RAW_TTL_DAYS} days'`))
    .del();
  const rollupDeleted = await db('engagement_rollup')
    .where('bucket', '<', db.raw(`now() - interval '${ROLLUP_TTL_DAYS} days'`))
    .del();

  if (presenceDeleted + interactionDeleted + rollupDeleted > 0) {
    console.log(
      `[EngagementAggregator] Pruned ${presenceDeleted} presence, ${interactionDeleted} interaction, ${rollupDeleted} rollup rows`
    );
  }
}
