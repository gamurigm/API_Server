import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
const vaultAddress = process.env.VAULT_ADDR;
const token = process.env.VAULT_TOKEN;
if (!databaseUrl || !vaultAddress || !token) throw new Error("DATABASE_URL, VAULT_ADDR and VAULT_TOKEN are required");
let databaseTarget;
try {
  databaseTarget = new URL(databaseUrl);
} catch {
  throw new Error("DATABASE_URL must point to local PostgreSQL");
}
const databaseHostname = databaseTarget.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
const loopbackDatabaseHosts = new Set(["127.0.0.1", "localhost", "::1"]);
const effectiveDatabaseHosts = [
  databaseHostname,
  ...databaseTarget.searchParams.getAll("host"),
  ...databaseTarget.searchParams.getAll("hostaddr"),
].map((hostname) => hostname.toLowerCase().replace(/^\[|\]$/gu, ""));
if (!["postgres:", "postgresql:"].includes(databaseTarget.protocol) ||
  effectiveDatabaseHosts.some((hostname) => !loopbackDatabaseHosts.has(hostname))) {
  throw new Error("DATABASE_URL must point to local PostgreSQL");
}
const vaultUrl = new URL(vaultAddress);
if (!["127.0.0.1", "localhost", "[::1]"].includes(vaultUrl.hostname.toLowerCase()) ||
  !["http:", "https:"].includes(vaultUrl.protocol) || vaultUrl.pathname !== "/" ||
  vaultUrl.username || vaultUrl.password || vaultUrl.search || vaultUrl.hash) {
  throw new Error("VAULT_ADDR must be a loopback URL without path or credentials");
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const vaultPathPattern = /^gateway\/credentials\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
async function deleteVaultPath(path) {
  if (!vaultPathPattern.test(path)) throw new Error("Invalid retired credential path");
  const url = new URL(`/v1/secret/metadata/${path}`, vaultUrl);
  const response = await fetch(url, {
    method: "DELETE",
    headers: { "X-Vault-Token": token },
    redirect: "error",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok && response.status !== 404) throw new Error("Vault cleanup failed; check Vault status and policy");
}

try {
  const { rows } = await pool.query(
    `SELECT id, vault_path, delete_requested_at FROM public.credentials
     WHERE retired_at IS NOT NULL AND vault_deleted_at IS NULL`,
  );
  let cleaned = 0;
  for (const row of rows) {
    await deleteVaultPath(row.vault_path);
    if (row.delete_requested_at) {
      await pool.query(
        `DELETE FROM public.credentials
         WHERE id = $1 AND retired_at IS NOT NULL AND delete_requested_at IS NOT NULL`,
        [row.id],
      );
    } else {
      await pool.query(
        "UPDATE public.credentials SET vault_deleted_at = now() WHERE id = $1 AND retired_at IS NOT NULL",
        [row.id],
      );
    }
    cleaned += 1;
  }

  const { rows: queuedRows } = await pool.query(
    `SELECT credential_id, vault_path FROM public.vault_cleanup_queue ORDER BY queued_at ASC`,
  );
  for (const row of queuedRows) {
    if (row.vault_path !== `gateway/credentials/${row.credential_id}`) {
      throw new Error("Invalid queued credential path");
    }
    await deleteVaultPath(row.vault_path);
    await pool.query(
      `DELETE FROM public.vault_cleanup_queue WHERE credential_id = $1 AND vault_path = $2`,
      [row.credential_id, row.vault_path],
    );
    cleaned += 1;
  }
  console.log(`Cleaned ${cleaned} Vault credential paths`);
} finally {
  await pool.end();
}
