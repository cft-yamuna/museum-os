import type { Knex } from 'knex';

/**
 * Brand-agnostic driver layer: `driver_family` selects which DeviceDriver controls
 * a device (curato-style). The unified DeviceManager builds one driver per device
 * from this column instead of the old per-`type` if-chain in the power route.
 *
 * Backfill maps the existing device `type` onto a family:
 *   projector       -> pjlink     (existing PJLink service, now wrapped as a driver)
 *   samsung_display -> sssp       (existing SSSP service, wrapped)
 *   lighting_dali   -> dali       (existing DALI service, wrapped)
 *   display/kiosk/pi/mcu -> agent (existing heavy agent, wrapped — unchanged behaviour)
 *   audio + anything else -> NULL (operator picks a family in the device editor)
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('devices', (table) => {
    table.string('driver_family', 40).nullable();
    table.index('driver_family');
  });

  await knex('devices').where('type', 'projector').update({ driver_family: 'pjlink' });
  await knex('devices').where('type', 'samsung_display').update({ driver_family: 'sssp' });
  await knex('devices').where('type', 'lighting_dali').update({ driver_family: 'dali' });
  await knex('devices')
    .whereIn('type', ['display', 'kiosk', 'raspberry_pi', 'esp32_mcu'])
    .update({ driver_family: 'agent' });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('devices', (table) => {
    table.dropIndex('driver_family');
    table.dropColumn('driver_family');
  });
}
