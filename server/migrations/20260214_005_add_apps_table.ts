import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Create apps table
  await knex.schema.createTable('apps', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('site_id').notNullable().references('id').inTable('sites').onDelete('CASCADE');
    table.string('name', 255).notNullable();
    table.string('template_type', 50).notNullable();
    table.jsonb('config').notNullable().defaultTo('{}');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.uuid('created_by').references('id').inTable('users');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_apps_site_id ON apps(site_id)');

  // 2. Add app_id column to devices
  await knex.schema.alterTable('devices', (table) => {
    table.uuid('app_id').references('id').inTable('apps').onDelete('SET NULL');
  });

  await knex.raw('CREATE INDEX idx_devices_app_id ON devices(app_id)');

  // 3. Data migration: convert existing device configs to app records
  const devicesWithTemplate = await knex('devices')
    .whereRaw("config->>'templateType' IS NOT NULL")
    .andWhereRaw("config->>'templateType' != 'null'");

  for (const device of devicesWithTemplate) {
    const config = typeof device.config === 'string'
      ? JSON.parse(device.config)
      : device.config || {};

    const templateType = config.templateType;
    if (!templateType) continue;

    const appConfig = config.appConfig || {};

    // Create app record
    const [app] = await knex('apps')
      .insert({
        site_id: device.site_id,
        name: `${device.display_name} - ${templateType}`,
        template_type: templateType,
        config: JSON.stringify(appConfig),
        is_active: true,
        created_by: null,
      })
      .returning('id');

    const appId = app.id;

    // Link device to app
    await knex('devices')
      .where({ id: device.id })
      .update({ app_id: appId });

    // Strip template fields from device config, keep apiKey and hardware fields
    const cleanConfig: Record<string, unknown> = {};
    const keepKeys = ['apiKey', 'pjlink_host', 'pjlink_port', 'pjlink_password', 'dali_gateway', 'dali_port'];
    for (const key of keepKeys) {
      if (config[key] !== undefined) {
        cleanConfig[key] = config[key];
      }
    }

    await knex('devices')
      .where({ id: device.id })
      .update({ config: JSON.stringify(cleanConfig) });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Reverse data migration: move app config back to devices
  const devicesWithApps = await knex('devices')
    .whereNotNull('app_id')
    .leftJoin('apps', 'devices.app_id', 'apps.id')
    .select('devices.*', 'apps.template_type', 'apps.config as app_config', 'apps.id as linked_app_id');

  for (const device of devicesWithApps) {
    if (!device.template_type) continue;

    const existingConfig = typeof device.config === 'string'
      ? JSON.parse(device.config)
      : device.config || {};

    const appConfig = typeof device.app_config === 'string'
      ? JSON.parse(device.app_config)
      : device.app_config || {};

    const mergedConfig = {
      ...existingConfig,
      templateType: device.template_type,
      instanceId: device.linked_app_id,
      appUrl: `/apps/${device.template_type}/${device.linked_app_id}`,
      appConfig,
    };

    await knex('devices')
      .where({ id: device.id })
      .update({ config: JSON.stringify(mergedConfig) });
  }

  // Drop app_id from devices
  await knex.raw('DROP INDEX IF EXISTS idx_devices_app_id');
  await knex.schema.alterTable('devices', (table) => {
    table.dropColumn('app_id');
  });

  // Drop apps table
  await knex.raw('DROP INDEX IF EXISTS idx_apps_site_id');
  await knex.schema.dropTableIfExists('apps');
}
