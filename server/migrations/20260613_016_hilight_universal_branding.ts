import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex('apps')
    .where({ template_type: 'custom01-wipro-timeline' })
    .update({ template_type: 'custom01-hilight-timeline' });

  await knex('sites')
    .where({ code: 'wipro-museum' })
    .update({
      code: 'hilight-museum',
      name: 'Curato',
    });

  await knex('sites')
    .where({ name: 'Wipro Museum' })
    .update({ name: 'Curato' });

  await knex('exhibitions')
    .where({ name: 'Wipro Heritage Exhibition' })
    .update({
      name: 'Curato Heritage Exhibition',
      description: 'Curato demo exhibition for heritage content and interactive displays',
    });
}

export async function down(knex: Knex): Promise<void> {
  await knex('apps')
    .where({ template_type: 'custom01-hilight-timeline' })
    .update({ template_type: 'custom01-wipro-timeline' });

  await knex('sites')
    .where({ code: 'hilight-museum' })
    .update({
      code: 'wipro-museum',
      name: 'Wipro Museum',
    });

  await knex('exhibitions')
    .where({ name: 'Curato Heritage Exhibition' })
    .update({
      name: 'Wipro Heritage Exhibition',
      description: 'Celebrating the history and innovation of Wipro',
    });
}
