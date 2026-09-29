import { getServerEnv } from "@/lib/env";
import { GatewayError } from "@/lib/errors";
import { findActiveCredential } from "@/lib/db/credentials";
import {
  acquireLease,
  consumeLimit,
  findEnabledAccess,
  findEnabledApplication,
  findEnabledProvider,
  findEnabledRoutes,
  insertInvocation,
  releaseLease,
} from "@/lib/db/consumer";
import { readGatewaySecret } from "@/lib/vault";
import type {
  ApplicationProviderAccess,
  ConsumerApplication,
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
  let application: ConsumerApplication | null;
  let provider: Provider | null;
  try {
    [application, provider] = await Promise.all([
      findEnabledApplication(principal.applicationId),
      findEnabledProvider(providerSlug),
    ]);
  } catch {
    throw new GatewayError(503, "catalog_unavailable", "The API catalog is unavailable", false);
  }
  if (!application) {
    throw new GatewayError(403, "application_disabled", "The consuming application is disabled");
  }
  if (!provider) {
    throw new GatewayError(404, "provider_not_found", "The requested provider is not registered");
  }

  let access: ApplicationProviderAccess | null;
  let routes: ProviderRoute[];
  try {
    [access, routes] = await Promise.all([
      findEnabledAccess(application.id, provider.id),
      findEnabledRoutes(provider.id, method),
    ]);
  } catch {
    throw new GatewayError(503, "catalog_unavailable", "Provider routes are unavailable", false);
  }
  if (!access) {
    throw new GatewayError(403, "provider_not_allowed", "This application cannot use the requested provider");
  }
  const route = routeMatcher(routes, method, actualPath);
  if (!route) {
    throw new GatewayError(404, "route_not_allowed", "The requested method and path are not enabled");
  }

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
  let result: RateLimitResult | null;
  try {
    result = await consumeLimit(context.application.id, context.provider.id, principal.subject, context.effectiveRateLimit);
  } catch {
    throw new GatewayError(503, "rate_limiter_unavailable", "Rate limiting is temporarily unavailable", false);
  }
  if (!result) {
    throw new GatewayError(503, "rate_limiter_unavailable", "Rate limiting is temporarily unavailable", false);
  }
  return result;
}

export async function acquireStreamLease(
  context: InvocationContext,
  principal: ExternalPrincipal,
): Promise<string> {
  let leaseId: string | null;
  try {
    leaseId = await acquireLease(
      context.application.id,
      context.provider.id,
      principal.subject,
      Math.ceil(context.provider.sse_timeout_ms / 1000) + 30,
    );
  } catch {
    throw new GatewayError(503, "stream_limiter_unavailable", "Stream limiting is temporarily unavailable", false);
  }
  if (!leaseId) {
    throw new GatewayError(429, "stream_limit_exceeded", "Maximum concurrent streams reached");
  }
  return leaseId;
}

export async function releaseStreamLease(leaseId: string): Promise<void> {
  try {
    await releaseLease(leaseId);
  } catch {
    console.error("stream_lease_release_failed", { code: "database_error" });
  }
}

export async function resolveProviderSecret(context: InvocationContext): Promise<string | null> {
  if (context.provider.auth_type === "none") {
    return null;
  }

  let credential;
  try {
    credential = await findActiveCredential(context.provider.id, context.application.id);
  } catch {
    throw new GatewayError(503, "credential_store_unavailable", "Credentials are unavailable", false);
  }
  if (!credential) {
    throw new GatewayError(503, "provider_credential_missing", "No credential is configured for this provider", false);
  }

  return readGatewaySecret(credential.vault_path);
}

export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await insertInvocation({
      requestId: input.requestId,
      applicationId: input.principal?.applicationId ?? null,
      identityProviderId: input.principal?.identityProviderId ?? null,
      apiKeyId: input.principal?.apiKeyId ?? null,
      providerId: input.providerId ?? null,
      routeId: input.routeId ?? null,
      issuer: input.principal?.issuer ?? null,
      subject: input.principal?.subject ?? null,
      method: input.method,
      path: input.path,
      outcome: input.outcome,
      gatewayErrorCode: input.gatewayErrorCode ?? null,
      upstreamStatus: input.upstreamStatus ?? null,
      durationMs: input.durationMs,
      responseBytes: input.responseBytes ?? null,
    });
  } catch {
    console.error("gateway_audit_write_failed", {
      requestId: input.requestId,
      code: "database_error",
    });
  }
}
