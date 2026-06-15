import knex, { Knex } from 'knex';
import { env } from './env.js';

let _db: Knex | null = null;

export function getDb(): Knex {
  if (!_db) {
    _db = knex({
      client: 'pg',
      connection: env.DATABASE_URL,
      pool: {
        min: 2,
        max: 10,
      },
      migrations: {
        directory: '../migrations',
        extension: 'ts',
      },
    });
  }
  return _db;
}

export async function closeDb(): Promise<void> {
  if (_db) {
    await _db.destroy();
    _db = null;
  }
}

export async function checkDbConnection(): Promise<boolean> {
  try {
    const db = getDb();
    await db.raw('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
