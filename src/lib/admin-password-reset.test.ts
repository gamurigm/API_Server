import { afterEach, describe, expect, it, vi } from "vitest";

const vaultMocks = vi.hoisted(() => ({
  read: vi.fn(),
}));

afterEach(() => vi.unstubAllEnvs());

vi.mock("@/lib/vault", () => ({
  readAdminPasswordHash: vaultMocks.read,
}));

import { verifyAdminPassword, issueAdminSession, isAdminSession, revokeAdminSession } from "@/lib/admin-session";
import { hashAdminPassword, verifyPasswordHash } from "@/lib/admin-password";

describe("local administrator password", () => {
  it("authenticates from ADMIN_PASSWORD_HASH without reading Vault", async () => {
    const hash = await hashAdminPassword("current-local-password-123");
    vi.stubEnv("DATABASE_URL", "postgresql://gateway:test@127.0.0.1:5434/gateway");
    vi.stubEnv("VAULT_ADDR", "http://127.0.0.1:43872/");
    vi.stubEnv("VAULT_TOKEN", "test-token");
    vi.stubEnv("ADMIN_PASSWORD_HASH", hash);
    vaultMocks.read.mockResolvedValue("invalid-vault-hash");

    await expect(verifyAdminPassword("current-local-password-123")).resolves.toBe(true);
    await expect(verifyAdminPassword("previous-local-password-123")).resolves.toBe(false);
    expect(vaultMocks.read).not.toHaveBeenCalled();
  });

  it("creates a salted hash that verifies without containing the password", async () => {
    const password = "new-local-password-123";
    const hash = await hashAdminPassword(password);

    expect(hash).toMatch(/^scrypt:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]{86}$/u);
    expect(hash).not.toContain(password);
    await expect(verifyPasswordHash(password, hash)).resolves.toBe(true);
  });

  it("creates, validates, and revokes an in-memory administrative session", () => {
    const session = issueAdminSession();
    expect(session.token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(isAdminSession(session.token)).toBe(true);

    revokeAdminSession(session.token);
    expect(isAdminSession(session.token)).toBe(false);
  });
});
