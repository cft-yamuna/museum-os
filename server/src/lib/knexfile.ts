import dotenv from 'dotenv';
import type { Knex } from 'knex';

dotenv.config();

const config: Knex.Config = {
  client: 'pg',
  connection: process.env.DATABASE_URL || 'postgresql://museumos:museumos@localhost:5432/museumos',
  pool: {
    min: 2,
    max: 10,
  },
  migrations: {
    directory: '../../migrations',
    extension: 'ts',
  },
  seeds: {
    directory: '../../seeds',
  },
};

export default config;
