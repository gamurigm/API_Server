import { spawn } from "node:child_process";

// Keep backend-only credentials out of the TUI process, even if a developer
// accidentally exports them in the shell or copies them into .env.tui.local.
const tuiEnv = { ...process.env };
for (const key of Object.keys(tuiEnv)) {
  const normalizedKey = key.toUpperCase();
  if (["DATABASE_URL", "VAULT_TOKEN", "ADMIN_PASSWORD_HASH", "NODE_OPTIONS"].includes(normalizedKey) ||
      normalizedKey.startsWith("SUPABASE_") ||
      normalizedKey.startsWith("NEXT_PUBLIC_SUPABASE_")) {
    delete tuiEnv[key];
  }
}

const exitCode = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ["--import", "tsx", "src/tui/main.ts"], {
    env: tuiEnv,
    stdio: "inherit",
  });
  child.once("error", reject);
  child.once("exit", (code) => resolve(code ?? 1));
});

process.exitCode = exitCode;
