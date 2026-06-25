import type { Knex } from 'knex';

/**
 * Hardware catalog (curato-style): the part numbers a museum deploys, each with
 * platform / control protocol / default port / capabilities. Decouples "what a
 * device is" (catalog part) from "what's installed" (devices row), and gives the
 * device editor a source of truth for driver_family + default port.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('catalog_parts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('part_number', 100).notNullable().unique();
    table.string('brand', 80);
    table.string('model', 120);
    table.string('category', 60); // display | projector | audio | pc | controller | network | storage
    table.string('platform', 80); // OS / platform
    table.string('protocol', 80); // human-readable protocol name
    table.string('driver_family', 40); // maps to the driver registry
    table.integer('default_port');
    table.jsonb('capabilities').defaultTo('[]');
    table.jsonb('spec').defaultTo('{}');
    table.text('notes');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // Seed the families this deployment actually uses (extend in the admin UI).
  await knex('catalog_parts').insert([
    {
      part_number: 'SAMSUNG-QMR-55',
      brand: 'Samsung',
      model: 'QM55R',
      category: 'display',
      platform: 'Tizen',
      protocol: 'Samsung MDC',
      driver_family: 'samsung-mdc',
      default_port: 1515,
      capabilities: JSON.stringify(['power', 'input', 'volume', 'mute', 'brightness']),
    },
    {
      part_number: 'SAMSUNG-SSSP-GENERIC',
      brand: 'Samsung',
      model: 'Smart Signage',
      category: 'display',
      platform: 'Tizen',
      protocol: 'SSSP (HTTP)',
      driver_family: 'sssp',
      default_port: 8001,
      capabilities: JSON.stringify(['power', 'restart', 'brightness']),
    },
    {
      part_number: 'PJLINK-GENERIC',
      brand: 'Generic',
      model: 'PJLink projector',
      category: 'projector',
      platform: 'Embedded',
      protocol: 'PJLink class-1',
      driver_family: 'pjlink',
      default_port: 4352,
      capabilities: JSON.stringify(['power', 'restart', 'input', 'mute']),
    },
    {
      part_number: 'KIOSK-PC-I5',
      brand: 'Generic',
      model: 'i5 kiosk PC',
      category: 'pc',
      platform: 'Windows 11 Pro',
      protocol: 'Museum OS Agent + WoL',
      driver_family: 'agent',
      default_port: 9,
      capabilities: JSON.stringify(['power', 'restart', 'deploy', 'attest']),
    },
    {
      part_number: 'DALI-GW-GENERIC',
      brand: 'Generic',
      model: 'DALI-2 gateway',
      category: 'controller',
      platform: 'Embedded',
      protocol: 'DALI over TCP',
      driver_family: 'dali',
      default_port: 5000,
      capabilities: JSON.stringify(['power', 'scene', 'dim', 'colorTemp']),
    },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('catalog_parts');
}
