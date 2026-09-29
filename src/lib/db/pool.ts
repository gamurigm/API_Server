import { Pool, types, type PoolClient } from "pg";

import { getServerEnv } from "@/lib/env";

let pool: Pool | undefined;

// Keep API timestamps in the same ISO-string shape returned by the old store.
types.setTypeParser(1184, (value) => new Date(value).toISOString());

export function getDbPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getServerEnv().DATABASE_URL,
      max: 10,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
    });
  }
  return pool;
}

export async function closeDbPool(): Promise<void> {
  if (!pool) return;
  const current = pool;
  pool = undefined;
  await current.end();
}

export async function withDbTransaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getDbPool().connect();
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
