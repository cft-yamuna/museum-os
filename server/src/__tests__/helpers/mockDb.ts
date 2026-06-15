/**
 * Chainable mock for Knex query builder.
 * Usage: vi.mocked(getDb).mockReturnValue(createMockKnex(mockData))
 *
 * Each call to mockKnex('tableName') returns a fresh chainable builder
 * that resolves to the configured data.
 */
import { vi, type Mock } from 'vitest';

interface MockQueryBuilder {
  select: Mock;
  where: Mock;
  whereIn: Mock;
  whereNot: Mock;
  whereNull: Mock;
  whereNotNull: Mock;
  whereRaw: Mock;
  whereILike: Mock;
  distinct: Mock;
  first: Mock;
  insert: Mock;
  update: Mock;
  del: Mock;
  delete: Mock;
  count: Mock;
  max: Mock;
  join: Mock;
  leftJoin: Mock;
  groupBy: Mock;
  orderBy: Mock;
  limit: Mock;
  offset: Mock;
  returning: Mock;
  raw: Mock;
  then: Mock;
  andOn: Mock;
  on: Mock;
  transaction: Mock;
  [key: string]: any;
}

export interface MockKnex {
  (table: string): MockQueryBuilder;
  raw: Mock;
  fn: { now: Mock };
  transaction: Mock;
  destroy: Mock;
  _setTableData: (table: string, data: any) => void;
}

/**
 * Create a chainable query builder that resolves to `resolveValue`.
 * Each method returns `this` (the same builder) for chaining,
 * except for terminal methods which resolve the value.
 */
export function createMockBuilder(resolveValue: any = []): MockQueryBuilder {
  const builder: any = {};

  const chainMethods = [
    'select', 'where', 'whereIn', 'whereNot', 'whereNull', 'whereNotNull', 'whereRaw', 'whereILike',
    'distinct', 'join', 'leftJoin', 'groupBy', 'orderBy', 'limit', 'offset',
    'on', 'andOn',
  ];

  for (const method of chainMethods) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }

  // Terminal methods that resolve
  builder.first = vi.fn().mockResolvedValue(
    Array.isArray(resolveValue) ? resolveValue[0] ?? undefined : resolveValue
  );
  builder.insert = vi.fn().mockReturnValue(builder);
  builder.update = vi.fn().mockReturnValue(builder);
  builder.del = vi.fn().mockResolvedValue(1);
  builder.delete = vi.fn().mockResolvedValue(1);
  builder.count = vi.fn().mockReturnValue(builder);
  builder.max = vi.fn().mockReturnValue(builder);

  // returning() resolves to the value
  builder.returning = vi.fn().mockResolvedValue(
    Array.isArray(resolveValue) ? resolveValue : [resolveValue]
  );

  // raw resolves like a query
  builder.raw = vi.fn().mockResolvedValue(resolveValue);

  // then() to make it thenable (await support for SELECT queries)
  builder.then = vi.fn().mockImplementation((resolve: any) => {
    return Promise.resolve(resolveValue).then(resolve);
  });

  // Transaction mock
  builder.transaction = vi.fn().mockImplementation(async (cb: any) => {
    const trxBuilder = createMockBuilder(resolveValue);
    const trx: any = (table: string) => trxBuilder;
    trx.fn = { now: vi.fn().mockReturnValue('NOW()') };
    return cb(trx);
  });

  return builder;
}

/**
 * Create a mock Knex instance.
 * Call `mockTable(tableName, data)` to configure what a table query returns.
 */
export function createMockKnex(): MockKnex {
  const tableData = new Map<string, any>();

  const knex: any = vi.fn().mockImplementation((table: string) => {
    // Strip table aliases: 'content as c' -> 'content'
    const baseTable = table.includes(' ') ? table.split(/\s+/)[0] : table;
    const data = tableData.get(baseTable);
    return createMockBuilder(data);
  });

  knex.raw = vi.fn().mockResolvedValue({ rows: [] });
  knex.fn = { now: vi.fn().mockReturnValue('NOW()') };
  knex.transaction = vi.fn().mockImplementation(async (cb: any) => {
    const trxBuilder = createMockBuilder([]);
    const trx: any = (table: string) => {
      const data = tableData.get(table);
      return createMockBuilder(data);
    };
    trx.fn = { now: vi.fn().mockReturnValue('NOW()') };
    return cb(trx);
  });
  knex.destroy = vi.fn().mockResolvedValue(undefined);

  // Utility to configure table mock data
  knex._setTableData = (table: string, data: any) => {
    tableData.set(table, data);
  };

  return knex as MockKnex;
}
