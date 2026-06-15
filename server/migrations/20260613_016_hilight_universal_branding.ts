import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex('apps')
    .where({ template_type: 'custom01-wipro-timeline' })
    .update({ template_type: 'custom01-hilight-timeline' });

  await knex('sites')
    .where({ code: 'wipro-museum' })
    .update({
      code: 'hilight-museum',
      name: 'Museum OS',
    });

  await knex('sites')
    .where({ name: 'Wipro Museum' })
    .update({ name: 'Museum OS' });

  await knex('exhibitions')
    .where({ name: 'Wipro Heritage Exhibition' })
    .update({
      name: 'Museum OS Heritage Exhibition',
      description: 'Museum OS demo exhibition for heritage content and interactive displays',
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
    .where({ name: 'Museum OS Heritage Exhibition' })
    .update({
      name: 'Wipro Heritage Exhibition',
      description: 'Celebrating the history and innovation of Wipro',
    });
}
