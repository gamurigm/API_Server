import { EventEmitter } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock("node:child_process", () => ({ spawn: spawnMock }));

const backendCredentialNames = [
  "DATABASE_URL",
  "VAULT_TOKEN",
  "ADMIN_PASSWORD_HASH",
  "NODE_OPTIONS",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_CUSTOM_SETTING",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "supabase_lowercase_setting",
  "next_public_supabase_lowercase_setting",
];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  spawnMock.mockReset();
});

describe("TUI child environment", () => {
  it("does not pass backend credentials or Supabase variables to the TUI process", async () => {
    for (const name of backendCredentialNames) vi.stubEnv(name, "test-value");
    vi.stubEnv("LOCAL_API_URL", "http://127.0.0.1:43871");

    spawnMock.mockImplementation(() => {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit("exit", 0));
      return child;
    });

    await import("./run-tui.mjs?test=supabase-environment-filter");

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [, , options] = spawnMock.mock.calls[0];
    expect(backendCredentialNames.filter((name) => Object.hasOwn(options.env, name))).toEqual([]);
    expect(options.env.LOCAL_API_URL).toBe("http://127.0.0.1:43871");
  });
});
