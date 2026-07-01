import fs from 'fs/promises';
import path from 'path';
import { getDb, closeDb } from '../lib/db.js';
import {
  exportDbJsonToFile,
  importDbJsonFromFile,
} from '../services/dbJsonTransfer.js';

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  try {
    if (command === 'export') {
      const filePath = getRequiredFileArg(args);
      await exportJson(filePath);
      return;
    }

    if (command === 'import') {
      const filePath = getRequiredFileArg(args);
      await importJson(filePath);
      return;
    }

    printUsage();
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

function printUsage(): void {
  console.log('Usage:');
  console.log('  npm run db:export:json -- --file ./backups/curato-db.json');
  console.log('  npm run db:import:json -- --file ./backups/curato-db.json');
  console.log('');
  console.log('Notes:');
  console.log('  - Export/import includes application tables in the public schema.');
  console.log('  - knex migration tables are excluded.');
  console.log('  - Import truncates existing application tables before restoring data.');
}

function getRequiredFileArg(args: string[]): string {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      return path.resolve(args[i + 1]);
    }
  }

  throw new Error('Missing required argument: --file <path>');
}

async function exportJson(filePath: string): Promise<void> {
  const db = getDb();
  const payload = await exportDbJsonToFile(db, filePath);
  for (const table of payload.tableOrder) {
    console.log(`[export] ${table}: ${payload.tables[table]?.length ?? 0} row(s)`);
  }
  console.log(`[export] wrote ${filePath}`);
}

async function importJson(filePath: string): Promise<void> {
  const db = getDb();
  await importDbJsonFromFile(db, filePath);
  console.log(`[import] restored from ${filePath}`);
}

main().catch((err) => {
  console.error('[db-json] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
