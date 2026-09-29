import { getDbPool } from "@/lib/db/pool";
import type {
  ApplicationProviderAccess,
  ConsumerApplication,
  IdentityProvider,
  Provider,
  ProviderRoute,
  RateLimitResult,
} from "@/types/gateway";

export async function queryRows<T>(sql: string, values: unknown[] = []): Promise<T[]> {
  return (await getDbPool().query(sql, values)).rows as T[];
}

export async function queryOne<T>(sql: string, values: unknown[] = []): Promise<T | null> {
  return (await queryRows<T>(sql, values))[0] ?? null;
}

export function findIdentityProviders(issuer: string): Promise<IdentityProvider[]> {
  return queryRows("SELECT * FROM public.identity_providers WHERE issuer = $1 AND enabled", [issuer]);
}

export function findEnabledApplication(id: string): Promise<ConsumerApplication | null> {
  return queryOne("SELECT * FROM public.consumer_applications WHERE id = $1 AND enabled", [id]);
}

export function findApplicationStatus(id: string): Promise<{ id: string; enabled: boolean } | null> {
  return queryOne("SELECT id, enabled FROM public.consumer_applications WHERE id = $1", [id]);
}

export async function recordExternalPrincipal(input: {
  applicationId: string;
  identityProviderId: string;
  issuer: string;
  subject: string;
  scopes: string[];
  roles: string[];
}): Promise<void> {
  await getDbPool().query(
    `INSERT INTO public.external_principals
      (consumer_application_id, identity_provider_id, issuer, subject, last_scopes, last_roles, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (identity_provider_id, subject) DO UPDATE SET
       last_scopes = EXCLUDED.last_scopes, last_roles = EXCLUDED.last_roles, last_seen_at = now()`,
    [input.applicationId, input.identityProviderId, input.issuer, input.subject, input.scopes, input.roles],
  );
}

export interface ApiKeyRecord {
  id: string;
  consumer_application_id: string;
  scopes: string[];
  expires_at: string | null;
  revoked_at: string | null;
}

export function findApiKeyByHash(hash: string): Promise<ApiKeyRecord | null> {
  return queryOne(
    "SELECT id, consumer_application_id, scopes, expires_at, revoked_at FROM public.application_api_keys WHERE key_hash = $1",
    [hash],
  );
}

export async function isAllowedOrigin(origin: string, applicationId?: string): Promise<boolean> {
  const row = await queryOne<{ allowed: boolean }>(
    `SELECT true AS allowed FROM public.application_origins
     WHERE origin = $1 AND enabled AND ($2::uuid IS NULL OR consumer_application_id = $2::uuid) LIMIT 1`,
    [origin, applicationId ?? null],
  );
  return Boolean(row);
}

export function findEnabledProvider(slug: string): Promise<Provider | null> {
  return queryOne("SELECT * FROM public.providers WHERE slug = $1 AND enabled", [slug]);
}

export function findEnabledAccess(applicationId: string, providerId: string): Promise<ApplicationProviderAccess | null> {
  return queryOne(
    `SELECT * FROM public.application_provider_access
     WHERE consumer_application_id = $1 AND provider_id = $2 AND enabled`,
    [applicationId, providerId],
  );
}

export function findEnabledRoutes(providerId: string, method: string): Promise<ProviderRoute[]> {
  return queryRows(
    "SELECT * FROM public.provider_routes WHERE provider_id = $1 AND method = $2 AND enabled",
    [providerId, method],
  );
}

export function consumeLimit(applicationId: string, providerId: string, subject: string, limit: number): Promise<RateLimitResult | null> {
  return queryOne(
    "SELECT * FROM public.consume_rate_limit($1::uuid, $2::uuid, $3::text, $4::integer)",
    [applicationId, providerId, subject, limit],
  );
}

export async function acquireLease(applicationId: string, providerId: string, subject: string, ttlSeconds: number): Promise<string | null> {
  const row = await queryOne<{ id: string | null }>(
    "SELECT public.acquire_stream_lease($1::uuid, $2::uuid, $3::text, 3, $4::integer) AS id",
    [applicationId, providerId, subject, ttlSeconds],
  );
  return row?.id ?? null;
}

export async function releaseLease(leaseId: string): Promise<void> {
  await getDbPool().query("SELECT public.release_stream_lease($1::uuid)", [leaseId]);
}

export interface CatalogProvider {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export interface CatalogRoute {
  provider_id: string;
  method: string;
  path_template: string;
  operation_id: string;
  description: string | null;
  required_scopes: string[];
  supports_sse: boolean;
}

export async function listAccessibleProviders(applicationId: string): Promise<{ providers: CatalogProvider[]; routes: CatalogRoute[] }> {
  const providers = await queryRows<CatalogProvider>(
    `SELECT p.id, p.name, p.slug, p.description FROM public.providers p
     JOIN public.application_provider_access a ON a.provider_id = p.id
     WHERE a.consumer_application_id = $1 AND a.enabled AND p.enabled ORDER BY p.name`,
    [applicationId],
  );
  if (providers.length === 0) return { providers, routes: [] };
  const routes = await queryRows<CatalogRoute>(
    `SELECT provider_id, method, path_template, operation_id, description, required_scopes, supports_sse
     FROM public.provider_routes WHERE provider_id = ANY($1::uuid[]) AND enabled ORDER BY path_template`,
    [providers.map((provider) => provider.id)],
  );
  return { providers, routes };
}

export interface InvocationRecord {
  requestId: string;
  applicationId: string | null;
  identityProviderId: string | null;
  apiKeyId: string | null;
  providerId: string | null;
  routeId: string | null;
  issuer: string | null;
  subject: string | null;
  method: string;
  path: string;
  outcome: "upstream" | "gateway_error";
  gatewayErrorCode: string | null;
  upstreamStatus: number | null;
  durationMs: number;
  responseBytes: number | null;
}

export async function insertInvocation(input: InvocationRecord): Promise<void> {
  await getDbPool().query(
    `INSERT INTO public.invocations
     (request_id, consumer_application_id, identity_provider_id, api_key_id, provider_id,
      provider_route_id, issuer, subject, method, path, outcome, gateway_error_code,
      upstream_status, duration_ms, response_bytes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [input.requestId, input.applicationId, input.identityProviderId, input.apiKeyId,
      input.providerId, input.routeId, input.issuer, input.subject, input.method, input.path,
      input.outcome, input.gatewayErrorCode, input.upstreamStatus, input.durationMs, input.responseBytes],
  );
}
