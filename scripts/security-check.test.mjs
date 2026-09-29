import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const securityCheck = fileURLToPath(new URL("./security-check.mjs", import.meta.url));
let fixtureRoot;

afterEach(() => {
  if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
  fixtureRoot = undefined;
});

describe("repository security checks", () => {
  it("rejects Supabase variables in the TUI example and an unfiltered TUI runner", () => {
    fixtureRoot = mkdtempSync(join(tmpdir(), "gateway-security-check-"));
    mkdirSync(join(fixtureRoot, "scripts"));
    writeFileSync(join(fixtureRoot, "package.json"), JSON.stringify({
      scripts: {
        dev: "node src/server/main.ts",
        start: "node src/server/main.ts",
      },
    }));
    writeFileSync(join(fixtureRoot, ".env.tui.example"), "LOCAL_API_URL=http://127.0.0.1:43871\nNEXT_PUBLIC_SUPABASE_ANON_KEY=example-only\n");
    writeFileSync(join(fixtureRoot, "scripts/run-tui.mjs"), `
      const tuiEnv = { ...process.env };
      for (const key of Object.keys(tuiEnv)) {
        if (["DATABASE_URL", "VAULT_TOKEN", "ADMIN_PASSWORD_HASH", "NODE_OPTIONS"].includes(key.toUpperCase())) delete tuiEnv[key];
      }
      spawn(process.execPath, ["--import", "tsx", "src/tui/main.ts"], { env: tuiEnv });
    `);

    const result = spawnSync(process.execPath, [securityCheck], {
      cwd: fixtureRoot,
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("scripts/run-tui.mjs");
    expect(result.stderr).toContain(".env.tui.example");
  });

  it("requires Supabase filtering to happen before the TUI child is spawned", () => {
    fixtureRoot = mkdtempSync(join(tmpdir(), "gateway-security-check-order-"));
    mkdirSync(join(fixtureRoot, "scripts"));
    writeFileSync(join(fixtureRoot, "package.json"), JSON.stringify({
      scripts: {
        dev: "node src/server/main.ts",
        start: "node src/server/main.ts",
      },
    }));
    writeFileSync(join(fixtureRoot, ".env.tui.example"), "LOCAL_API_URL=http://127.0.0.1:43871\n");
    writeFileSync(join(fixtureRoot, "scripts/run-tui.mjs"), `
      const tuiEnv = { ...process.env };
      for (const key of Object.keys(tuiEnv)) {
        if (["DATABASE_URL", "VAULT_TOKEN", "ADMIN_PASSWORD_HASH", "NODE_OPTIONS"].includes(key.toUpperCase())) delete tuiEnv[key];
      }
      spawn(process.execPath, ["--import", "tsx", "src/tui/main.ts"], { env: tuiEnv });
      const normalizedKey = key.toUpperCase();
      normalizedKey.startsWith("SUPABASE_");
      normalizedKey.startsWith("NEXT_PUBLIC_SUPABASE_");
    `);

    const result = spawnSync(process.execPath, [securityCheck], {
      cwd: fixtureRoot,
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("scripts/run-tui.mjs");
  });

  it("scans files under stale Supabase temporary paths for exposed private keys", () => {
    fixtureRoot = mkdtempSync(join(tmpdir(), "gateway-security-check-supabase-path-"));
    mkdirSync(join(fixtureRoot, "scripts"));
    mkdirSync(join(fixtureRoot, "supabase", ".temp"), { recursive: true });
    writeFileSync(join(fixtureRoot, "package.json"), JSON.stringify({
      scripts: {
        dev: "node src/server/main.ts",
        start: "node src/server/main.ts",
      },
    }));
    writeFileSync(join(fixtureRoot, ".env.tui.example"), "LOCAL_API_URL=http://127.0.0.1:43871\n");
    writeFileSync(join(fixtureRoot, "scripts/run-tui.mjs"), `
      const tuiEnv = { ...process.env };
      for (const key of Object.keys(tuiEnv)) {
        const normalizedKey = key.toUpperCase();
        if (["DATABASE_URL", "VAULT_TOKEN", "ADMIN_PASSWORD_HASH", "NODE_OPTIONS"].includes(normalizedKey) ||
            normalizedKey.startsWith("SUPABASE_") ||
            normalizedKey.startsWith("NEXT_PUBLIC_SUPABASE_")) delete tuiEnv[key];
      }
      spawn(process.execPath, ["--import", "tsx", "src/tui/main.ts"], { env: tuiEnv });
    `);
    writeFileSync(join(fixtureRoot, "supabase", ".temp", "private-key.txt"), "-----BEGIN PRIVATE KEY-----\nsynthetic\n-----END PRIVATE KEY-----\n");

    const result = spawnSync(process.execPath, [securityCheck], {
      cwd: fixtureRoot,
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("supabase/.temp/private-key.txt: possible private key");
  });
});
