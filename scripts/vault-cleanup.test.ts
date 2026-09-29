import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  Pool: vi.fn(),
  query: vi.fn(),
  end: vi.fn(),
}));

vi.mock("pg", () => ({
  default: { Pool: mocks.Pool },
}));

const scriptUrl = new URL("./vault-cleanup.mjs", import.meta.url).href;
let runNumber = 0;
const queuedId = "1c10de7f-4e85-49a7-94eb-7c3cf328ce7e";
const queuedPath = `gateway/credentials/${queuedId}`;

describe("Vault cleanup database target", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue({ rows: [] });
    mocks.end.mockResolvedValue(undefined);
    mocks.Pool.mockImplementation(class FakePool {
      query = mocks.query;
      end = mocks.end;
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.stubEnv("VAULT_ADDR", "http://127.0.0.1:43872/");
    vi.stubEnv("VAULT_TOKEN", "synthetic-test-token");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    "https://127.0.0.1/database",
    "postgresql://user:password@db.example.test:5434/database",
    "postgres://user:password@192.168.1.20:5434/database",
    "postgresql://user:password@127.0.0.1:5434/database?host=db.example.test",
    "postgresql://user:password@127.0.0.1:5434/database?host=localhost&host=db.example.test",
    "postgresql://user:password@127.0.0.1:5434/database?hostaddr=192.168.1.20",
  ])("rejects a non-local PostgreSQL target before connecting or deleting Vault secrets: %s", async (databaseUrl) => {
    vi.stubEnv("DATABASE_URL", databaseUrl);

    await expect(import(`${scriptUrl}?case=${runNumber++}`))
      .rejects.toThrow("DATABASE_URL must point to local PostgreSQL");

    expect(mocks.Pool).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  }, 20_000);

  it.each([
    "postgresql://user:password@127.0.0.1:5434/database",
    "postgres://user:password@localhost:5434/database",
    "postgresql://user:password@[::1]:5434/database",
  ])("allows local PostgreSQL targets: %s", async (databaseUrl) => {
    vi.stubEnv("DATABASE_URL", databaseUrl);

    await import(`${scriptUrl}?case=${runNumber++}`);

    expect(mocks.Pool).toHaveBeenCalledWith({ connectionString: databaseUrl, max: 1 });
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(fetch).not.toHaveBeenCalled();
  }, 20_000);

  it.each([204, 404])("deletes failed-write queue rows after Vault returns %i", async (status) => {
    const databaseUrl = "postgresql://user:password@127.0.0.1:5434/database";
    vi.stubEnv("DATABASE_URL", databaseUrl);
    mocks.query.mockImplementation(async (sql: string) =>
      sql.includes("vault_cleanup_queue")
        ? { rows: [{ credential_id: queuedId, vault_path: queuedPath }] }
        : { rows: [] },
    );
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status }));

    await import(`${scriptUrl}?case=${runNumber++}`);

    expect(fetch).toHaveBeenCalledWith(
      new URL(`/v1/secret/metadata/${queuedPath}`, "http://127.0.0.1:43872/"),
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM public.vault_cleanup_queue"),
      [queuedId, queuedPath],
    );
  });

  it("keeps failed-write queue rows when Vault deletion fails", async () => {
    const databaseUrl = "postgresql://user:password@127.0.0.1:5434/database";
    vi.stubEnv("DATABASE_URL", databaseUrl);
    mocks.query.mockImplementation(async (sql: string) =>
      sql.includes("vault_cleanup_queue")
        ? { rows: [{ credential_id: queuedId, vault_path: queuedPath }] }
        : { rows: [] },
    );
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));

    await expect(import(`${scriptUrl}?case=${runNumber++}`))
      .rejects.toThrow("Vault cleanup failed; check Vault status and policy");

    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("DELETE FROM public.vault_cleanup_queue"))).toBe(false);
  });
});
