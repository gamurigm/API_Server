import { queryOne, queryRows } from "@/lib/db/consumer";
import { getDbPool } from "@/lib/db/pool";

export interface ApiKeyMetadata {
  id: string;
  consumer_application_id: string;
  label: string;
  key_prefix: string;
  scopes: string[];
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

const metadata = "id, consumer_application_id, label, key_prefix, scopes, expires_at, revoked_at, created_at";

export function listApiKeys(): Promise<ApiKeyMetadata[]> {
  return queryRows(`SELECT ${metadata} FROM public.application_api_keys ORDER BY created_at DESC`);
}

export async function createApiKey(input: {
  consumer_application_id: string;
  label: string;
  scopes: string[];
  expires_at?: string | null;
  key_hash: string;
  key_prefix: string;
}): Promise<ApiKeyMetadata | null> {
  const application = await queryOne<{ id: string }>(
    "SELECT id FROM public.consumer_applications WHERE id = $1 AND enabled",
    [input.consumer_application_id],
  );
  if (!application) return null;
  return queryOne(
    `INSERT INTO public.application_api_keys
     (consumer_application_id, label, scopes, expires_at, key_hash, key_prefix)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${metadata}`,
    [input.consumer_application_id, input.label, [...new Set(input.scopes)],
      input.expires_at ?? null, input.key_hash, input.key_prefix],
  );
}

export async function revokeApiKey(id: string): Promise<void> {
  await getDbPool().query(
    "UPDATE public.application_api_keys SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL",
    [id],
  );
}
