import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_BYTES = 64;

export async function hashAdminPassword(password: string): Promise<string> {
  if (!password) throw new Error("Administrator password is required");
  const salt = randomBytes(16);
  const digest = await scrypt(password, salt, KEY_BYTES) as Buffer;
  return `scrypt:${salt.toString("base64url")}:${digest.toString("base64url")}`;
}

export async function verifyPasswordHash(password: string, encoded: string): Promise<boolean> {
  const match = /^scrypt:([A-Za-z0-9_-]{22}):([A-Za-z0-9_-]{86})$/u.exec(encoded);
  if (!match) return false;
  const salt = Buffer.from(match[1], "base64url");
  const expected = Buffer.from(match[2], "base64url");
  if (salt.length !== 16 || expected.length !== KEY_BYTES) return false;
  const actual = await scrypt(password, salt, KEY_BYTES) as Buffer;
  return timingSafeEqual(actual, expected);
}
