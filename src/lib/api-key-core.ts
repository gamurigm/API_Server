import { createHash, randomBytes } from "node:crypto";

export const API_KEY_PREFIX = "fgk_";

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function isApiKey(key: string): boolean {
  return /^fgk_[A-Za-z0-9_-]{43}$/u.test(key);
}

export function generateApiKey() {
  const key = `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { key, hash: hashApiKey(key), prefix: key.slice(0, 12) };
}
