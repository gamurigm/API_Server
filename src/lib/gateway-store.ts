import "server-only";

import { getServerEnv } from "@/lib/env";
import { GatewayError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ApplicationProviderAccess,
  ConsumerApplication,
  CredentialMetadata,
  ExternalPrincipal,
  Provider,
  ProviderRoute,
  RateLimitResult,
} from "@/types/gateway";

export interface InvocationContext {
  application: ConsumerApplication;
  provider: Provider;
  route: ProviderRoute;
  access: ApplicationProviderAccess;
  effectiveRateLimit: number;
}

export interface AuditInput {
  requestId: string;
  principal?: ExternalPrincipal;
  providerId?: string;
  routeId?: string;
  method: string;
  path: string;
  outcome: "upstream" | "gateway_error";
  gatewayErrorCode?: string;
  upstreamStatus?: number;
  durationMs: number;
  responseBytes?: number;
}

export async function loadInvocationContext(
  principal: ExternalPrincipal,
  providerSlug: string,
  method: string,
  actualPath: string,
  routeMatcher: (routes: ProviderRoute[], method: string, path: string) => ProviderRoute | undefined,
): Promise<InvocationContext> {
  const admin = createAdminClient();
  const [applicationResult, providerResult] = await Promise.all([
    admin
      .from("consumer_applications")
      .select("*")
      .eq("id", principal.applicationId)
      .eq("enabled", true)
      .maybeSingle(),
    admin.from("providers").select("*").eq("slug", providerSlug).eq("enabled", true).maybeSingle(),
  ]);

  if (applicationResult.error || !applicationResult.data) {
    throw new GatewayError(403, "application_disabled", "The consuming application is disabled");
  }
  if (providerResult.error) {
    throw new GatewayError(503, "catalog_unavailable", "The API catalog is unavailable", false);
  }
  if (!providerResult.data) {
    throw new GatewayError(404, "provider_not_found", "The requested provider is not registered");
  }

  const application = applicationResult.data as ConsumerApplication;
  const provider = providerResult.data as Provider;
  const [accessResult, routeResult] = await Promise.all([
    admin
      .from("application_provider_access")
      .select("*")
      .eq("consumer_application_id", application.id)
      .eq("provider_id", provider.id)
      .eq("enabled", true)
      .maybeSingle(),
    admin
      .from("provider_routes")
      .select("*")
      .eq("provider_id", provider.id)
      .eq("method", method)
      .eq("enabled", true),
  ]);

  if (accessResult.error || !accessResult.data) {
    throw new GatewayError(403, "provider_not_allowed", "This application cannot use the requested provider");
  }
  if (routeResult.error) {
    throw new GatewayError(503, "catalog_unavailable", "Provider routes are unavailable", false);
  }

  const route = routeMatcher((routeResult.data ?? []) as ProviderRoute[], method, actualPath);
  if (!route) {
    throw new GatewayError(404, "route_not_allowed", "The requested method and path are not enabled");
  }

  const access = accessResult.data as ApplicationProviderAccess;
  const globalLimit = getServerEnv().GATEWAY_RATE_LIMIT_PER_MINUTE;
  const limits = [
    globalLimit,
    application.rate_limit_per_minute,
    provider.rate_limit_per_minute,
    access.rate_limit_per_minute ?? Number.MAX_SAFE_INTEGER,
  ];

  return {
    application,
    provider,
    route,
    access,
    effectiveRateLimit: Math.min(...limits),
  };
}

export async function consumeRateLimit(
  context: InvocationContext,
  principal: ExternalPrincipal,
): Promise<RateLimitResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("consume_rate_limit", {
    p_consumer_application_id: context.application.id,
    p_provider_id: context.provider.id,
    p_subject: principal.subject,
    p_limit: context.effectiveRateLimit,
  });

  if (error || !Array.isArray(data) || data.length !== 1) {
    throw new GatewayError(503, "rate_limiter_unavailable", "Rate limiting is temporarily unavailable", false);
  }
  return data[0] as RateLimitResult;
}

export async function acquireStreamLease(
  context: InvocationContext,
  principal: ExternalPrincipal,
): Promise<string> {
  const { data, error } = await createAdminClient().rpc("acquire_stream_lease", {
    p_consumer_application_id: context.application.id,
    p_provider_id: context.provider.id,
    p_subject: principal.subject,
    p_limit: 3,
    p_ttl_seconds: Math.ceil(context.provider.sse_timeout_ms / 1000) + 30,
  });
  if (error) {
    throw new GatewayError(503, "stream_limiter_unavailable", "Stream limiting is temporarily unavailable", false);
  }
  if (typeof data !== "string") {
    throw new GatewayError(429, "stream_limit_exceeded", "Maximum concurrent streams reached");
  }
  return data;
}

export async function releaseStreamLease(leaseId: string): Promise<void> {
  const { error } = await createAdminClient().rpc("release_stream_lease", {
    p_lease_id: leaseId,
  });
  if (error) {
    console.error("stream_lease_release_failed", { code: error.code });
  }
}

async function findCredential(
  providerId: string,
  applicationId: string,
): Promise<CredentialMetadata | null> {
  const admin = createAdminClient();
  const applicationCredential = await admin
    .from("credentials")
    .select("*")
    .eq("provider_id", providerId)
    .eq("owner_type", "application")
    .eq("consumer_application_id", applicationId)
    .eq("enabled", true)
    .maybeSingle();

  if (applicationCredential.error) {
    throw new GatewayError(503, "credential_store_unavailable", "Credentials are unavailable", false);
  }
  if (applicationCredential.data) {
    return applicationCredential.data as CredentialMetadata;
  }

  const sharedCredential = await admin
    .from("credentials")
    .select("*")
    .eq("provider_id", providerId)
    .eq("owner_type", "shared")
    .eq("enabled", true)
    .maybeSingle();
  if (sharedCredential.error) {
    throw new GatewayError(503, "credential_store_unavailable", "Credentials are unavailable", false);
  }
  return (sharedCredential.data as CredentialMetadata | null) ?? null;
}

export async function resolveProviderSecret(context: InvocationContext): Promise<string | null> {
  if (context.provider.auth_type === "none") {
    return null;
  }

  const credential = await findCredential(context.provider.id, context.application.id);
  if (!credential) {
    throw new GatewayError(503, "provider_credential_missing", "No credential is configured for this provider", false);
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("read_gateway_secret", {
    p_credential_id: credential.id,
  });
  if (error || typeof data !== "string" || !data) {
    throw new GatewayError(503, "credential_store_unavailable", "The provider credential could not be resolved", false);
  }
  return data;
}

export async function writeAudit(input: AuditInput): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("invocations").insert({
    request_id: input.requestId,
    consumer_application_id: input.principal?.applicationId ?? null,
    identity_provider_id: input.principal?.identityProviderId ?? null,
    provider_id: input.providerId ?? null,
    provider_route_id: input.routeId ?? null,
    issuer: input.principal?.issuer ?? null,
    subject: input.principal?.subject ?? null,
    method: input.method,
    path: input.path,
    outcome: input.outcome,
    gateway_error_code: input.gatewayErrorCode ?? null,
    upstream_status: input.upstreamStatus ?? null,
    duration_ms: input.durationMs,
    response_bytes: input.responseBytes ?? null,
  });

  if (error) {
    console.error("gateway_audit_write_failed", {
      requestId: input.requestId,
      code: error.code,
    });
  }
}
