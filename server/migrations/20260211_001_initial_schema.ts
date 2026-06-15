import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Enable pgcrypto extension for gen_random_uuid()
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  // 1. sites table
  await knex.schema.createTable('sites', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 255).notNullable();
    table.string('code', 50).notNullable().unique();
    table.text('address');
    table.string('timezone', 50).defaultTo('UTC');
    table.jsonb('config').defaultTo('{}');
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // 2. floors table
  await knex.schema.createTable('floors', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('site_id').notNullable().references('id').inTable('sites').onDelete('CASCADE');
    table.string('name', 255).notNullable();
    table.integer('level');
    table.string('background_image', 500);
    table.integer('width');
    table.integer('height');
    table.jsonb('config').defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 3. devices table
  await knex.schema.createTable('devices', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('site_id').notNullable().references('id').inTable('sites').onDelete('CASCADE');
    table.uuid('floor_id').references('id').inTable('floors').onDelete('SET NULL');
    table.string('mac_address', 17).notNullable().unique();
    table.string('hostname', 255);
    table.string('display_name', 255);
    table.string('type', 50).notNullable();
    table.jsonb('capabilities').defaultTo('[]');
    table.specificType('ip_address', 'INET');
    table.string('status', 20).defaultTo('offline');
    table.timestamp('last_seen');
    table.integer('x_position');
    table.integer('y_position');
    table.jsonb('config').defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Indexes
    table.index('site_id');
    table.index('status');
    table.index('mac_address');
  });

  // 4. device_groups table
  await knex.schema.createTable('device_groups', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('site_id').notNullable().references('id').inTable('sites').onDelete('CASCADE');
    table.string('name', 255).notNullable();
    table.string('type', 50).notNullable().comment("'zone','functional','custom'");
    table.text('description');
    table.string('color', 7);
    table.jsonb('config').defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 5. device_group_members table
  await knex.schema.createTable('device_group_members', (table) => {
    table.uuid('group_id').notNullable().references('id').inTable('device_groups').onDelete('CASCADE');
    table.uuid('device_id').notNullable().references('id').inTable('devices').onDelete('CASCADE');
    table.primary(['group_id', 'device_id']);
  });

  // 6. users table
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.string('name', 255);
    table.string('role', 50).notNullable().comment("'super_admin','site_admin','content_manager','operator'");
    table.specificType('site_ids', 'UUID[]');
    table.boolean('is_active').defaultTo(true);
    table.timestamp('last_login');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 7. content table
  await knex.schema.createTable('content', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('site_id').notNullable().references('id').inTable('sites').onDelete('CASCADE');
    table.string('name', 255).notNullable();
    table.string('type', 50).notNullable().comment("'video','image','pdf','app'");
    table.text('description');
    table.integer('current_version').defaultTo(1);
    table.boolean('is_active').defaultTo(true);
    table.uuid('created_by').references('id').inTable('users');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Index
    table.index('site_id');
  });

  // 8. content_versions table
  await knex.schema.createTable('content_versions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('content_id').notNullable().references('id').inTable('content').onDelete('CASCADE');
    table.integer('version_number').notNullable();
    table.string('file_path', 500).notNullable();
    table.bigInteger('file_size');
    table.string('hash', 64).comment('SHA-256');
    table.jsonb('metadata').defaultTo('{}');
    table.uuid('created_by').references('id').inTable('users');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    // Unique constraint
    table.unique(['content_id', 'version_number']);
  });

  // 9. playlists table
  await knex.schema.createTable('playlists', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('site_id').notNullable().references('id').inTable('sites').onDelete('CASCADE');
    table.string('name', 255).notNullable();
    table.text('description');
    table.boolean('loop').defaultTo(true);
    table.boolean('is_active').defaultTo(true);
    table.uuid('created_by').references('id').inTable('users');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // 10. playlist_items table
  await knex.schema.createTable('playlist_items', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('playlist_id').notNullable().references('id').inTable('playlists').onDelete('CASCADE');
    table.uuid('content_id').notNullable().references('id').inTable('content').onDelete('CASCADE');
    table.integer('position').notNullable();
    table.integer('duration_sec');
    table.string('transition', 50).defaultTo('fade');
    table.jsonb('config').defaultTo('{}');
  });

  // 11. exhibitions table
  await knex.schema.createTable('exhibitions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('site_id').notNullable().references('id').inTable('sites').onDelete('CASCADE');
    table.string('name', 255).notNullable();
    table.text('description');
    table.date('start_date');
    table.date('end_date');
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 12. exhibition_assignments table
  await knex.schema.createTable('exhibition_assignments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('exhibition_id').notNullable().references('id').inTable('exhibitions').onDelete('CASCADE');
    table.uuid('device_id').notNullable().references('id').inTable('devices').onDelete('CASCADE');
    table.uuid('content_id').references('id').inTable('content');
    table.uuid('playlist_id').references('id').inTable('playlists');
    table.jsonb('config').defaultTo('{}');
  });

  // Add CHECK constraint for exhibition_assignments
  await knex.raw(`
    ALTER TABLE exhibition_assignments
    ADD CONSTRAINT chk_content_or_playlist
    CHECK (content_id IS NOT NULL OR playlist_id IS NOT NULL)
  `);

  // 13. schedules table
  await knex.schema.createTable('schedules', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('site_id').notNullable().references('id').inTable('sites').onDelete('CASCADE');
    table.string('name', 255).notNullable();
    table.string('type', 50).notNullable().comment("'power','content','maintenance'");
    table.string('target_type', 50).notNullable().comment("'device','group','zone'");
    table.specificType('target_ids', 'UUID[]').notNullable();
    table.string('action', 50).notNullable();
    table.string('cron_expression', 100).notNullable();
    table.jsonb('payload').defaultTo('{}');
    table.boolean('is_enabled').defaultTo(true);
    table.uuid('created_by').references('id').inTable('users');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 14. alerts table
  await knex.schema.createTable('alerts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('site_id').notNullable().references('id').inTable('sites').onDelete('CASCADE');
    table.uuid('device_id').references('id').inTable('devices').onDelete('CASCADE');
    table.string('type', 50).notNullable();
    table.string('severity', 20).notNullable().comment("'low','medium','high','critical'");
    table.text('message').notNullable();
    table.boolean('is_acknowledged').defaultTo(false);
    table.uuid('acknowledged_by').references('id').inTable('users');
    table.timestamp('acknowledged_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    // Indexes
    table.index('site_id');
    table.index('is_acknowledged');
  });

  // 15. audit_logs table
  await knex.schema.createTable('audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').references('id').inTable('users');
    table.uuid('site_id').references('id').inTable('sites');
    table.string('action', 100).notNullable();
    table.string('entity_type', 50);
    table.uuid('entity_id');
    table.jsonb('details').defaultTo('{}');
    table.specificType('ip_address', 'INET');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    // Index
    table.index('created_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  // Drop tables in reverse order to handle foreign key dependencies
  await knex.schema.dropTableIfExists('audit_logs');
  await knex.schema.dropTableIfExists('alerts');
  await knex.schema.dropTableIfExists('schedules');
  await knex.schema.dropTableIfExists('exhibition_assignments');
  await knex.schema.dropTableIfExists('exhibitions');
  await knex.schema.dropTableIfExists('playlist_items');
  await knex.schema.dropTableIfExists('playlists');
  await knex.schema.dropTableIfExists('content_versions');
  await knex.schema.dropTableIfExists('content');
  await knex.schema.dropTableIfExists('users');
  await knex.schema.dropTableIfExists('device_group_members');
  await knex.schema.dropTableIfExists('device_groups');
  await knex.schema.dropTableIfExists('devices');
  await knex.schema.dropTableIfExists('floors');
  await knex.schema.dropTableIfExists('sites');

  // Drop extension
  await knex.raw('DROP EXTENSION IF EXISTS "pgcrypto"');
}
