import { queryOne, queryRows } from "@/lib/db/consumer";

type Row = Record<string, unknown>;

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export function listApplications(): Promise<Row[]> {
  return queryRows("SELECT * FROM public.consumer_applications ORDER BY name");
}

export function createApplication(input: {
  name: string; slug: string; description?: string | null; rate_limit_per_minute: number; enabled: boolean;
}): Promise<Row | null> {
  return queryOne(
    `INSERT INTO public.consumer_applications (name, slug, description, rate_limit_per_minute, enabled)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [input.name, input.slug, input.description ?? null, input.rate_limit_per_minute, input.enabled],
  );
}

export function listIdentityProviders(): Promise<Row[]> {
  return queryRows(
    `SELECT i.*, json_build_object('name', a.name, 'slug', a.slug) AS consumer_applications
     FROM public.identity_providers i
     JOIN public.consumer_applications a ON a.id = i.consumer_application_id ORDER BY i.name`,
  );
}

export function createIdentityProvider(input: {
  consumer_application_id: string; name: string; issuer: string; jwks_uri: string;
  audiences: string[]; scopes_claim: string; roles_claim: string; enabled: boolean;
}): Promise<Row | null> {
  return queryOne(
    `INSERT INTO public.identity_providers
     (consumer_application_id, name, issuer, jwks_uri, audiences, scopes_claim, roles_claim, enabled)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [input.consumer_application_id, input.name, input.issuer, input.jwks_uri, input.audiences,
      input.scopes_claim, input.roles_claim, input.enabled],
  );
}

export function listProviders(): Promise<Row[]> {
  return queryRows("SELECT * FROM public.providers ORDER BY name");
}

export function createProvider(input: {
  name: string; slug: string; description?: string | null; base_url: string;
  auth_type: string; auth_config: Record<string, unknown>; timeout_ms: number;
  sse_timeout_ms: number; rate_limit_per_minute: number; enabled: boolean;
}): Promise<Row | null> {
  return queryOne(
    `INSERT INTO public.providers
     (name, slug, description, base_url, auth_type, auth_config, timeout_ms,
      sse_timeout_ms, rate_limit_per_minute, enabled)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10) RETURNING *`,
    [input.name, input.slug, input.description ?? null, input.base_url, input.auth_type,
      JSON.stringify(input.auth_config), input.timeout_ms, input.sse_timeout_ms,
      input.rate_limit_per_minute, input.enabled],
  );
}

export function listRoutes(providerId: string | null): Promise<Row[]> {
  return queryRows(
    "SELECT * FROM public.provider_routes WHERE ($1::uuid IS NULL OR provider_id = $1::uuid) ORDER BY path_template",
    [providerId],
  );
}

export function createRoute(input: {
  provider_id: string; method: string; path_template: string; operation_id: string;
  description?: string | null; required_scopes: string[]; allowed_request_headers: string[];
  allowed_response_headers: string[]; supports_sse: boolean; enabled: boolean; source: string;
}): Promise<Row | null> {
  return queryOne(
    `INSERT INTO public.provider_routes
     (provider_id, method, path_template, operation_id, description, required_scopes,
      allowed_request_headers, allowed_response_headers, supports_sse, enabled, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [input.provider_id, input.method, input.path_template, input.operation_id, input.description ?? null,
      input.required_scopes, input.allowed_request_headers, input.allowed_response_headers,
      input.supports_sse, input.enabled, input.source],
  );
}

export function listAccess(): Promise<Row[]> {
  return queryRows(
    `SELECT x.*, json_build_object('name', a.name, 'slug', a.slug) AS consumer_applications,
            json_build_object('name', p.name, 'slug', p.slug) AS providers
     FROM public.application_provider_access x
     JOIN public.consumer_applications a ON a.id = x.consumer_application_id
     JOIN public.providers p ON p.id = x.provider_id ORDER BY x.created_at DESC`,
  );
}

export function upsertAccess(input: {
  consumer_application_id: string; provider_id: string; enabled: boolean;
  rate_limit_per_minute?: number | null;
}): Promise<Row | null> {
  return queryOne(
    `INSERT INTO public.application_provider_access
     (consumer_application_id, provider_id, enabled, rate_limit_per_minute)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (consumer_application_id, provider_id) DO UPDATE SET
       enabled = EXCLUDED.enabled, rate_limit_per_minute = EXCLUDED.rate_limit_per_minute
     RETURNING *`,
    [input.consumer_application_id, input.provider_id, input.enabled, input.rate_limit_per_minute ?? null],
  );
}

export function listOrigins(): Promise<Row[]> {
  return queryRows(
    `SELECT o.*, json_build_object('name', a.name, 'slug', a.slug) AS consumer_applications
     FROM public.application_origins o
     JOIN public.consumer_applications a ON a.id = o.consumer_application_id ORDER BY o.origin`,
  );
}

export function upsertOrigin(input: { consumer_application_id: string; origin: string; enabled: boolean }): Promise<Row | null> {
  return queryOne(
    `INSERT INTO public.application_origins (consumer_application_id, origin, enabled)
     VALUES ($1,$2,$3)
     ON CONFLICT (consumer_application_id, origin) DO UPDATE SET enabled = EXCLUDED.enabled
     RETURNING *`,
    [input.consumer_application_id, input.origin, input.enabled],
  );
}

export function listAudit(limit: number): Promise<Row[]> {
  return queryRows(
    `SELECT i.*,
       CASE WHEN a.id IS NULL THEN NULL ELSE json_build_object('name', a.name, 'slug', a.slug) END AS consumer_applications,
       CASE WHEN p.id IS NULL THEN NULL ELSE json_build_object('name', p.name, 'slug', p.slug) END AS providers,
       CASE WHEN r.id IS NULL THEN NULL ELSE json_build_object('operation_id', r.operation_id) END AS provider_routes
     FROM public.invocations i
     LEFT JOIN public.consumer_applications a ON a.id = i.consumer_application_id
     LEFT JOIN public.providers p ON p.id = i.provider_id
     LEFT JOIN public.provider_routes r ON r.id = i.provider_route_id
     ORDER BY i.created_at DESC LIMIT $1`,
    [limit],
  );
}

const resourceTables = {
  applications: "consumer_applications",
  "identity-providers": "identity_providers",
  providers: "providers",
  routes: "provider_routes",
  access: "application_provider_access",
  origins: "application_origins",
} as const;

export function isCatalogResource(value: string): value is keyof typeof resourceTables {
  return Object.hasOwn(resourceTables, value);
}

export function setResourceEnabled(resource: keyof typeof resourceTables, id: string, enabled: boolean): Promise<{ id: string; enabled: boolean } | null> {
  const table = resourceTables[resource];
  return queryOne(`UPDATE public.${table} SET enabled = $2 WHERE id = $1 RETURNING id, enabled`, [id, enabled]);
}
