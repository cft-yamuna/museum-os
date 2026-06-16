import fs from 'fs/promises';
import path from 'path';
import type { Knex } from 'knex';

const EXCLUDED_TABLES = new Set([
  'knex_migrations',
  'knex_migrations_lock',
]);

const DEFAULT_CHUNK_SIZE = 500;

export interface DbJsonExportPayload {
  format: 'museumos-db-json-v1';
  exportedAt: string;
  tables: Record<string, Record<string, unknown>[]>;
  tableOrder: string[];
}

export async function exportDbJsonToFile(db: Knex, filePath: string): Promise<DbJsonExportPayload> {
  const payload = await buildDbJsonExportPayload(db);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

export async function buildDbJsonExportPayload(db: Knex): Promise<DbJsonExportPayload> {
  const tables = await getAppTables(db);
  const tableOrder = await getInsertOrder(db, tables);
  const payload: DbJsonExportPayload = {
    format: 'museumos-db-json-v1',
    exportedAt: new Date().toISOString(),
    tables: {},
    tableOrder,
  };

  for (const table of tableOrder) {
    const rows = await db(table).select('*');
    payload.tables[table] = rows as Record<string, unknown>[];
  }

  return payload;
}

export async function importDbJsonFromFile(db: Knex, filePath: string): Promise<void> {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw) as Partial<DbJsonExportPayload>;
  const payload = normalizePayload(parsed);
  await importDbJsonPayload(db, payload);
}

export async function importDbJsonPayload(db: Knex, payloadInput: Partial<DbJsonExportPayload>): Promise<void> {
  const payload = normalizePayload(payloadInput);
  const tables = await getAppTables(db);
  const importOrder = payload.tableOrder.filter((table) => tables.includes(table));

  await db.transaction(async (trx) => {
    const quotedTables = tables.map(quoteIdent).join(', ');
    await trx.raw(`TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE`);

    for (const table of importOrder) {
      const rows = payload.tables[table] ?? [];
      if (rows.length === 0) continue;
      await db.batchInsert(table, rows, DEFAULT_CHUNK_SIZE).transacting(trx);
    }
  });
}

export function normalizePayload(parsed: Partial<DbJsonExportPayload>): DbJsonExportPayload {
  if (parsed.format !== 'museumos-db-json-v1' || !parsed.tables || !parsed.tableOrder) {
    throw new Error('Unsupported JSON dump format');
  }

  return {
    format: parsed.format,
    exportedAt: parsed.exportedAt ?? new Date().toISOString(),
    tables: parsed.tables,
    tableOrder: parsed.tableOrder,
  };
}

async function getAppTables(db: Knex): Promise<string[]> {
  const rows = await db('pg_tables')
    .withSchema('pg_catalog')
    .select<{ tablename: string }[]>('tablename')
    .where({ schemaname: 'public' })
    .orderBy('tablename');

  return rows
    .map((row) => row.tablename)
    .filter((name) => !EXCLUDED_TABLES.has(name));
}

async function getInsertOrder(db: Knex, tables: string[]): Promise<string[]> {
  const edges = await db
    .select<{
      child_table: string;
      parent_table: string;
    }[]>({
      child_table: 'tc.table_name',
      parent_table: 'ccu.table_name',
    })
    .from({ tc: 'information_schema.table_constraints' })
    .join({ ccu: 'information_schema.constraint_column_usage' }, function () {
      this.on('ccu.constraint_name', '=', 'tc.constraint_name')
        .andOn('ccu.table_schema', '=', 'tc.table_schema');
    })
    .where('tc.table_schema', 'public')
    .andWhere('tc.constraint_type', 'FOREIGN KEY');

  const tableSet = new Set(tables);
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, Set<string>>();

  for (const table of tables) {
    inDegree.set(table, 0);
    adjacency.set(table, new Set());
  }

  for (const edge of edges) {
    if (!tableSet.has(edge.child_table) || !tableSet.has(edge.parent_table)) continue;

    const children = adjacency.get(edge.parent_table)!;
    if (children.has(edge.child_table)) continue;

    children.add(edge.child_table);
    inDegree.set(edge.child_table, (inDegree.get(edge.child_table) ?? 0) + 1);
  }

  const queue = [...tables].filter((table) => inDegree.get(table) === 0).sort();
  const ordered: string[] = [];

  while (queue.length > 0) {
    const table = queue.shift()!;
    ordered.push(table);

    for (const child of adjacency.get(table) ?? []) {
      const nextDegree = (inDegree.get(child) ?? 0) - 1;
      inDegree.set(child, nextDegree);
      if (nextDegree === 0) {
        queue.push(child);
        queue.sort();
      }
    }
  }

  if (ordered.length !== tables.length) {
    const remaining = tables.filter((table) => !ordered.includes(table)).sort();
    ordered.push(...remaining);
  }

  return ordered;
}

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
