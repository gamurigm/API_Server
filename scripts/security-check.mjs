import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const excludedDirectories = new Set([".git", ".next", ".superpowers", "coverage", "node_modules"]);
const excludedPaths = new Set([".env.local", "package-lock.json", "tsconfig.tsbuildinfo"]);
const findings = [];

function shouldSkip(path) {
  const normalized = relative(root, path).replaceAll("\\", "/");
  if (excludedPaths.has(normalized)) return true;
  return normalized.split("/").some((segment) => excludedDirectories.has(segment));
}

function scan(path) {
  if (shouldSkip(path)) return;
  const stat = statSync(path);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) scan(join(path, entry));
    return;
  }
  if (stat.size > 2_000_000) return;
  let content;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    return;
  }
  const file = relative(root, path).replaceAll("\\", "/");
  const patterns = [
    [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u, "private key"],
    [/\bgh[oprsu]_[A-Za-z0-9]{20,}\b/u, "GitHub token"],
    [/\bAKIA[0-9A-Z]{16}\b/u, "AWS access key"],
    [/\bsb_secret_[A-Za-z0-9_-]{20,}\b/u, "Supabase secret key"],
    [/\bfgk_[A-Za-z0-9_-]{43}\b/u, "gateway access key"],
    [/[?&](?:password|passwd|secret|token)=/iu, "credential in query string"],
  ];
  for (const [pattern, label] of patterns) {
    const match = pattern.exec(content);
    if (!match) continue;
    const value = match[0];
    if (value.includes("REPLACE_ME") || value.includes("build_only")) continue;
    findings.push(`${file}: possible ${label}`);
  }
}

scan(root);

const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (!packageJson.scripts.dev?.includes("src/server/main.ts") ||
    !packageJson.scripts.start?.includes("src/server/main.ts") ||
    packageJson.dependencies?.next || packageJson.dependencies?.react || packageJson.dependencies?.["react-dom"]) {
  findings.push("package.json: dev and start must use the Hono server without Next.js/React runtime dependencies");
}
if (packageJson.scripts["local:setup"] || packageJson.scripts["local:test"]) {
  findings.push("package.json: obsolete local database setup/test scripts must not be exposed");
}
const tuiRunner = readFileSync(join(root, "scripts/run-tui.mjs"), "utf8");
const stripSecretAt = tuiRunner.indexOf('"VAULT_TOKEN", "ADMIN_PASSWORD_HASH"');
const spawnAt = tuiRunner.indexOf('spawn(process.execPath, ["--import", "tsx", "src/tui/main.ts"]');
const supabaseFilterAt = tuiRunner.indexOf('normalizedKey.startsWith("SUPABASE_")');
const publicSupabaseFilterAt = tuiRunner.indexOf('normalizedKey.startsWith("NEXT_PUBLIC_SUPABASE_")');
if (stripSecretAt < 0 || spawnAt < 0 || stripSecretAt > spawnAt ||
    supabaseFilterAt < 0 || supabaseFilterAt > spawnAt ||
    publicSupabaseFilterAt < 0 || publicSupabaseFilterAt > spawnAt) {
  findings.push("scripts/run-tui.mjs: strip backend database, Vault, admin and Supabase variables before spawning the TUI/tsx process");
}
const tuiEnvExample = readFileSync(join(root, ".env.tui.example"), "utf8");
if (/(?:DATABASE_URL|VAULT_TOKEN|ADMIN_PASSWORD_HASH|(?:NEXT_PUBLIC_)?SUPABASE_[A-Z0-9_]*)\s*=/iu.test(tuiEnvExample)) {
  findings.push(".env.tui.example: must not include backend credentials or Supabase variables");
}

if (findings.length > 0) {
  console.error("Security checks failed:\n" + findings.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}
console.log("Security checks: OK");
