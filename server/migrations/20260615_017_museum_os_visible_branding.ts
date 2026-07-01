import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex('sites')
    .where({ code: 'hilight-museum' })
    .update({ name: 'Curato' });

  await knex('users')
    .where({ email: 'admin@hilight.local' })
    .update({ email: 'admin@curato.local' });

  await knex('exhibitions')
    .where({ name: 'hiLight Heritage Exhibition' })
    .update({
      name: 'Curato Heritage Exhibition',
      description: 'Curato demo exhibition for heritage content and interactive displays',
    });
}

export async function down(knex: Knex): Promise<void> {
  await knex('sites')
    .where({ code: 'hilight-museum' })
    .update({ name: 'hiLight Museum' });

  await knex('users')
    .where({ email: 'admin@curato.local' })
    .update({ email: 'admin@hilight.local' });

  await knex('exhibitions')
    .where({ name: 'Curato Heritage Exhibition' })
    .update({
      name: 'hiLight Heritage Exhibition',
      description: 'Celebrating the history and innovation of hiLight',
    });
}
