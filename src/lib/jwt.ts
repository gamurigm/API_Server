import "server-only";

import {
  createRemoteJWKSet,
  customFetch,
} from "jose";

import { getServerEnv } from "@/lib/env";
import { GatewayError } from "@/lib/errors";
import { inspectRs256Token, verifyRs256Token } from "@/lib/jwt-core";
import { assertPublicProviderUrl } from "@/lib/network-security";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ConsumerApplication,
  ExternalPrincipal,
  IdentityProvider,
} from "@/types/gateway";

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getRemoteJwks(uri: string) {
  const cached = jwksCache.get(uri);
  if (cached) {
    return cached;
  }

  const jwks = createRemoteJWKSet(new URL(uri), {
    cacheMaxAge: getServerEnv().GATEWAY_JWKS_CACHE_MS,
    cooldownDuration: 30_000,
    timeoutDuration: 5_000,
    [customFetch]: async (url, options) => {
      await assertPublicProviderUrl(url);
      return fetch(url, { ...options, cache: "no-store", redirect: "manual" });
    },
  });
  jwksCache.set(uri, jwks);
  return jwks;
}

function stringClaimValues(value: unknown): string[] {
  if (typeof value === "string") {
    return value.split(/[\s,]+/u).filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return [];
}

export function extractBearerToken(request: Request): string {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    throw new GatewayError(401, "missing_token", "A Bearer token is required");
  }

  const match = /^Bearer\s+([^\s]+)$/iu.exec(authorization);
  if (!match) {
    throw new GatewayError(401, "invalid_token", "Authorization must use Bearer authentication");
  }
  return match[1];
}

export async function verifyExternalToken(token: string): Promise<ExternalPrincipal> {
  const { issuer, subject, audiences } = inspectRs256Token(token);

  const admin = createAdminClient();
  const { data: providers, error: providerError } = await admin
    .from("identity_providers")
    .select("*")
    .eq("issuer", issuer)
    .eq("enabled", true);

  if (providerError) {
    throw new GatewayError(503, "identity_store_unavailable", "Identity configuration is unavailable", false);
  }

  const identityProviders = ((providers as IdentityProvider[] | null) ?? []).filter((candidate) =>
    candidate.audiences.some((audience) => audiences.includes(audience)),
  );
  if (identityProviders.length === 0) {
    throw new GatewayError(401, "untrusted_issuer", "The token issuer or audience is not registered");
  }
  if (identityProviders.length > 1) {
    throw new GatewayError(401, "ambiguous_token_mapping", "The token maps to more than one consuming application");
  }
  const [identityProvider] = identityProviders;

  const { data: applicationData, error: applicationError } = await admin
    .from("consumer_applications")
    .select("*")
    .eq("id", identityProvider.consumer_application_id)
    .eq("enabled", true)
    .maybeSingle();
  if (applicationError || !applicationData) {
    throw new GatewayError(403, "application_disabled", "The consuming application is disabled");
  }

  const application = applicationData as ConsumerApplication;
  let claims;
  try {
    claims = await verifyRs256Token(token, identityProvider, getRemoteJwks(identityProvider.jwks_uri));
  } catch (error) {
    if (error instanceof GatewayError) throw error;
    throw new GatewayError(503, "jwks_unavailable", "The issuer public keys are unavailable", false);
  }

  const scopes = stringClaimValues(claims[identityProvider.scopes_claim]);
  const roles = stringClaimValues(claims[identityProvider.roles_claim]);

  const { error: principalError } = await admin.from("external_principals").upsert(
    {
      consumer_application_id: application.id,
      identity_provider_id: identityProvider.id,
      issuer,
      subject,
      last_scopes: scopes,
      last_roles: roles,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "identity_provider_id,subject" },
  );
  if (principalError) {
    // Authentication succeeded; a transient audit/profile write must not turn
    // the valid request into an authentication failure.
    console.error("external_principal_upsert_failed", { code: principalError.code });
  }

  return {
    applicationId: application.id,
    identityProviderId: identityProvider.id,
    issuer,
    subject,
    scopes,
    roles,
    claims: claims as Record<string, unknown>,
  };
}

export async function authenticateExternalRequest(request: Request): Promise<ExternalPrincipal> {
  return verifyExternalToken(extractBearerToken(request));
}
