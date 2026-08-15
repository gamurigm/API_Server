import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const excludedDirectories = new Set([".git", ".next", "coverage", "node_modules"]);
const excludedPaths = new Set([".env.local", "package-lock.json", "tsconfig.tsbuildinfo"]);
const findings = [];

function shouldSkip(path) {
  const normalized = relative(root, path).replaceAll("\\", "/");
  if (excludedPaths.has(normalized)) return true;
  if (normalized.startsWith("supabase/.temp/") || normalized.startsWith("supabase/.branches/")) return true;
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
const loginSource = readFileSync(join(root, "src/app/login/login-button.tsx"), "utf8");
const localRouteSource = readFileSync(join(root, "src/app/auth/local/route.ts"), "utf8");
const nextConfigSource = readFileSync(join(root, "next.config.ts"), "utf8");
if (/name=["']password["']/u.test(loginSource) || loginSource.includes("LOCAL_ADMIN_PASSWORD")) {
  findings.push("login-button.tsx: local password must never reach client markup");
}
if (!loginSource.includes('action="/auth/local"') || !loginSource.includes('method="post"')) {
  findings.push("login-button.tsx: local login must use an explicit POST form");
}
if (!loginSource.includes('"X-Local-Login": "1"') ||
    !loginSource.includes("onSubmit={signInLocally}")) {
  findings.push("login-button.tsx: local login must use the anti-CSRF request header");
}
if (!localRouteSource.includes('process.env.NODE_ENV !== "production"') ||
    !localRouteSource.includes('request.headers.get("x-local-login") === "1"') ||
    !localRouteSource.includes('isLoopback(requestUrl.hostname)') ||
    !localRouteSource.includes('loopbackOrigin(process.env.NEXT_PUBLIC_APP_URL)')) {
  findings.push("auth/local: missing production, loopback, or same-origin guard");
}
if (!nextConfigSource.includes("form-action 'self'") ||
    !nextConfigSource.includes("frame-ancestors 'none'")) {
  findings.push("next.config.ts: missing form and framing CSP restrictions");
}

if (findings.length > 0) {
  console.error("Security checks failed:\n" + findings.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}
console.log("Security checks: OK");
