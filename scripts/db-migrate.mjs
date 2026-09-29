import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required for db:migrate");
const parsed = new URL(url);
if (!["postgres:", "postgresql:"].includes(parsed.protocol) ||
  !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)) {
  throw new Error("DATABASE_URL must point to local PostgreSQL");
}

const root = fileURLToPath(new URL("../db/migrations/", import.meta.url));
const migrations = (await readdir(root)).filter((name) => /^\d+_[a-z0-9_-]+\.sql$/u.test(name)).sort();
const pool = new pg.Pool({ connectionString: url, max: 1 });
const client = await pool.connect();
try {
  await client.query("SELECT pg_advisory_lock(4213006)");
  await client.query("CREATE TABLE IF NOT EXISTS public.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const applied = new Set((await client.query("SELECT name FROM public.schema_migrations")).rows.map((row) => row.name));
  for (const name of migrations) {
    if (applied.has(name)) continue;
    const sql = await readFile(join(root, name), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO public.schema_migrations (name) VALUES ($1)", [name]);
      await client.query("COMMIT");
      console.log(`Applied ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.query("SELECT pg_advisory_unlock(4213006)").catch(() => undefined);
  client.release();
  await pool.end();
}
