import { afterEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getDbPool: vi.fn(),
  withDbTransaction: vi.fn(),
  queryOne: vi.fn(),
  queryRows: vi.fn(),
  poolQuery: vi.fn(),
  writeSecret: vi.fn(),
  deleteSecret: vi.fn(),
}));

vi.mock("@/lib/db/consumer", () => ({ queryOne: dbMocks.queryOne, queryRows: dbMocks.queryRows }));
vi.mock("@/lib/db/pool", () => ({ getDbPool: dbMocks.getDbPool, withDbTransaction: dbMocks.withDbTransaction }));
vi.mock("@/lib/vault", () => ({ deleteGatewaySecret: dbMocks.deleteSecret, writeGatewaySecret: dbMocks.writeSecret }));

import { createCredential } from "@/lib/db/credentials";

afterEach(() => vi.resetAllMocks());

describe("credential creation compensation", () => {
  it("queues a Vault secret for cleanup when the database write and compensation both fail", async () => {
    let path = "";
    const transactionError = new Error("database transaction failed");
    dbMocks.writeSecret.mockImplementation(async (id: string) => {
      path = `gateway/credentials/${id}`;
      return path;
    });
    dbMocks.withDbTransaction.mockRejectedValue(transactionError);
    dbMocks.deleteSecret.mockRejectedValue(new Error("Vault unavailable"));
    dbMocks.poolQuery.mockResolvedValue({ rows: [] });
    dbMocks.getDbPool.mockReturnValue({ query: dbMocks.poolQuery });

    await expect(createCredential({
      provider_id: "9ec6de8f-b350-414f-bf94-a64f1b8c44b9",
      owner_type: "shared",
      label: "synthetic",
      secret: "synthetic-secret",
    })).rejects.toBe(transactionError);

    expect(dbMocks.poolQuery).toHaveBeenCalledWith(
      expect.stringMatching(/INSERT INTO public\.vault_cleanup_queue/u),
      [path.slice("gateway/credentials/".length), path],
    );
  });
});
