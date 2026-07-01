import fs from 'fs/promises';
import path from 'path';
import type { Knex } from 'knex';
import { reconcileAgentVersionStorage } from './agentStorageReconcile.js';

const EXCLUDED_TABLES = new Set([
  'knex_migrations',
  'knex_migrations_lock',
]);

const DEFAULT_CHUNK_SIZE = 500;

export interface DbJsonExportPayload {
  format: 'curato-db-json-v1';
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
    format: 'curato-db-json-v1',
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
  // Real columns per table in the TARGET schema. A dump exported from an older
  // schema may carry columns since removed by migration (e.g. devices.floor_id);
  // we drop those so an older dump still restores into a newer schema.
  const columnsByTable = await getColumnsByTable(db);

  await db.transaction(async (trx) => {
    const quotedTables = tables.map(quoteIdent).join(', ');
    // Disable FK/trigger enforcement for this full reload so it can't be broken
    // by table ordering or self-referential FKs (e.g. devices.parent_id). Scoped
    // to this transaction via SET LOCAL, so it auto-resets on commit/rollback.
    // Requires a superuser DB role (the curato app connects as postgres).
    await trx.raw(`SET LOCAL session_replication_role = 'replica'`);
    await trx.raw(`TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE`);

    for (const table of importOrder) {
      const rows = payload.tables[table] ?? [];
      if (rows.length === 0) continue;

      const cols = columnsByTable.get(table);
      let toInsert = rows;
      if (cols) {
        const dropped = new Set<string>();
        toInsert = rows.map((row) => {
          const cleaned: Record<string, unknown> = {};
          for (const key of Object.keys(row)) {
            if (cols.has(key)) cleaned[key] = row[key];
            else dropped.add(key);
          }
          return cleaned;
        });
        if (dropped.size > 0) {
          console.warn(
            `[DbImport] ${table}: dropped column(s) not in current schema: ${[...dropped].sort().join(', ')}`
          );
        }
      }

      await db.batchInsert(table, toInsert, DEFAULT_CHUNK_SIZE).transacting(trx);
    }
  });

  // The dump restored the agent_versions rows but not the tarballs in storage,
  // so rows may now point at files that don't exist on this server (kiosk
  // downloads would fail with FILE_MISSING). Repoint them at a tarball that is
  // present. Best-effort: a reconcile problem must never fail a good import.
  try {
    const r = await reconcileAgentVersionStorage(db);
    if (r.repaired > 0 || r.unresolved > 0) {
      console.log(
        `[DbImport] agent_versions reconcile: repaired ${r.repaired}, unresolved ${r.unresolved} of ${r.checked}`
      );
    }
  } catch (err) {
    console.warn(
      '[DbImport] agent_versions reconcile failed:',
      err instanceof Error ? err.message : err
    );
  }
}

export function normalizePayload(parsed: Partial<DbJsonExportPayload>): DbJsonExportPayload {
  if (parsed.format !== 'curato-db-json-v1' || !parsed.tables || !parsed.tableOrder) {
    throw new Error('Unsupported JSON dump format');
  }

  return {
    format: parsed.format,
    exportedAt: parsed.exportedAt ?? new Date().toISOString(),
    tables: parsed.tables,
    tableOrder: parsed.tableOrder,
  };
}

/** Map of table name -> set of its column names in the public schema. */
async function getColumnsByTable(db: Knex): Promise<Map<string, Set<string>>> {
  const rows = await db
    .select<{ table_name: string; column_name: string }[]>('table_name', 'column_name')
    .from('information_schema.columns')
    .where('table_schema', 'public');

  const map = new Map<string, Set<string>>();
  for (const row of rows) {
    let cols = map.get(row.table_name);
    if (!cols) {
      cols = new Set<string>();
      map.set(row.table_name, cols);
    }
    cols.add(row.column_name);
  }
  return map;
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
    // Self-referential FKs (e.g. devices.parent_id -> devices.id) are not a
    // table-ordering constraint; counting them leaves the table permanently
    // blocked in the topological sort.
    if (edge.child_table === edge.parent_table) continue;

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
