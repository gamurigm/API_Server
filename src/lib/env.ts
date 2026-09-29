import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.url().refine((value) => {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return ["postgres:", "postgresql:"].includes(url.protocol) &&
      ["127.0.0.1", "localhost", "[::1]"].includes(hostname);
  }, "must point to local PostgreSQL"),
  VAULT_ADDR: z.url().refine((value) => {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname.toLowerCase()) &&
      !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash;
  }, "must be a loopback Vault URL without path or credentials"),
  VAULT_TOKEN: z.string().min(1),
  ADMIN_PASSWORD_HASH: z.string().regex(/^scrypt:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]{86}$/u),
  GATEWAY_HTTP_PORT: z.coerce.number().int().min(1).max(65_535).default(43_871),
  GATEWAY_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(60),
  GATEWAY_JSON_LIMIT_BYTES: z.coerce.number().int().positive().default(5_242_880),
  GATEWAY_JWKS_CACHE_MS: z.coerce.number().int().positive().default(300_000),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedServerEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) {
    return cachedServerEnv;
  }

  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Missing or invalid server environment variables: ${fields}`);
  }

  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}
