import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Merge idle config into base config for slideshow-idle apps
  await knex('apps')
    .where('template_type', 'slideshow-idle')
    .update({
      template_type: 'slideshow',
      updated_at: knex.fn.now(),
    });

  // Merge idle config into base config for video-loop-idle apps
  await knex('apps')
    .where('template_type', 'video-loop-idle')
    .update({
      template_type: 'video-loop',
      updated_at: knex.fn.now(),
    });
}

export async function down(knex: Knex): Promise<void> {
  // WARNING: This rollback assumes all apps with idle config were originally
  // -idle variants. Apps created after this migration with idle enabled will
  // be incorrectly typed. Manual intervention required on production data.
  await knex.raw(`
    UPDATE apps
    SET template_type = 'slideshow-idle', updated_at = NOW()
    WHERE template_type = 'slideshow'
      AND config->>'idle' IS NOT NULL
      AND config->'idle'->>'url' IS NOT NULL
  `);

  await knex.raw(`
    UPDATE apps
    SET template_type = 'video-loop-idle', updated_at = NOW()
    WHERE template_type = 'video-loop'
      AND config->>'idle' IS NOT NULL
      AND config->'idle'->>'url' IS NOT NULL
  `);
}
