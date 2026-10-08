const backendOnlyNames = new Set(["DATABASE_URL", "VAULT_TOKEN", "ADMIN_PASSWORD_HASH", "NODE_OPTIONS"]);

export function adminClientEnv(source = process.env) {
  const env = { ...source };
  for (const key of Object.keys(env)) {
    const normalizedKey = key.toUpperCase();
    if (backendOnlyNames.has(normalizedKey) || normalizedKey.startsWith("SUPABASE_") || normalizedKey.startsWith("NEXT_PUBLIC_SUPABASE_")) {
      delete env[key];
    }
  }
  return env;
}
