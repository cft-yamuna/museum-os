import type { Knex } from 'knex';
import * as bcrypt from 'bcryptjs';

export async function seed(knex: Knex): Promise<void> {
  // Check if data already exists
  const existingSites = await knex('sites').select('id').limit(1);
  if (existingSites.length > 0) {
    console.log('Default data already exists, skipping seed...');
    return;
  }

  // Create default site
  const [site] = await knex('sites')
    .insert({
      name: 'Museum OS',
      code: 'hilight-museum',
      timezone: 'Asia/Kolkata',
      address: '',
      config: {},
      is_active: true,
    })
    .returning('*');

  console.log('Created default site:', site.name);

  // Create super admin user
  const passwordHash = await bcrypt.hash('admin123', 10);

  const [user] = await knex('users')
    .insert({
      email: 'admin@museumos.local',
      password_hash: passwordHash,
      name: 'Admin',
      role: 'super_admin',
      site_ids: [site.id],
      is_active: true,
      must_change_password: true,
    })
    .returning('*');

  console.log('Created super admin user:', user.email);
  console.log('Default password: admin123');
}
