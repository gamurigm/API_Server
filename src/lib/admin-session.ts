import { createHash, randomBytes } from "node:crypto";

import { verifyPasswordHash } from "@/lib/admin-password";
import { getServerEnv } from "@/lib/env";

const SESSION_MS = 60 * 60 * 1_000;
const registry = globalThis as typeof globalThis & { __gatewayAdminSessions?: Map<string, number> };
const sessions = registry.__gatewayAdminSessions ??= new Map<string, number>();

function tokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  return verifyPasswordHash(password, getServerEnv().ADMIN_PASSWORD_HASH);
}

export function issueAdminSession(): { token: string; expiresAt: string } {
  for (const [digest, expiresAt] of sessions) {
    if (expiresAt <= Date.now()) sessions.delete(digest);
  }
  const token = randomBytes(32).toString("base64url");
  const expires = Date.now() + SESSION_MS;
  sessions.set(tokenDigest(token), expires);
  return { token, expiresAt: new Date(expires).toISOString() };
}

export function isAdminSession(token: string): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(token)) return false;
  const digest = tokenDigest(token);
  const expires = sessions.get(digest);
  if (!expires) return false;
  if (expires <= Date.now()) {
    sessions.delete(digest);
    return false;
  }
  return true;
}

export function revokeAdminSession(token: string): void {
  if (/^[A-Za-z0-9_-]{43}$/u.test(token)) sessions.delete(tokenDigest(token));
}
