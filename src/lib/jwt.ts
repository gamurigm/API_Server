import {
  createRemoteJWKSet,
  customFetch,
} from "jose";

import { getServerEnv } from "@/lib/env";
import { API_KEY_PREFIX } from "@/lib/api-key-core";
import { verifyApiKey } from "@/lib/api-keys";
import { GatewayError } from "@/lib/errors";
import { inspectRs256Token, verifyRs256Token } from "@/lib/jwt-core";
import { assertPublicProviderUrl } from "@/lib/network-security";
import { findEnabledApplication, findIdentityProviders, recordExternalPrincipal } from "@/lib/db/consumer";
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

  let providers: IdentityProvider[];
  try {
    providers = await findIdentityProviders(issuer);
  } catch {
    throw new GatewayError(503, "identity_store_unavailable", "Identity configuration is unavailable", false);
  }
  const identityProviders = providers.filter((candidate) =>
    candidate.audiences.some((audience) => audiences.includes(audience)),
  );
  if (identityProviders.length === 0) {
    throw new GatewayError(401, "untrusted_issuer", "The token issuer or audience is not registered");
  }
  if (identityProviders.length > 1) {
    throw new GatewayError(401, "ambiguous_token_mapping", "The token maps to more than one consuming application");
  }
  const [identityProvider] = identityProviders;

  let applicationData: ConsumerApplication | null;
  try {
    applicationData = await findEnabledApplication(identityProvider.consumer_application_id);
  } catch {
    throw new GatewayError(503, "identity_store_unavailable", "Application verification is unavailable", false);
  }
  if (!applicationData) {
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

  try {
    await recordExternalPrincipal({
      applicationId: application.id,
      identityProviderId: identityProvider.id,
      issuer,
      subject,
      scopes,
      roles,
    });
  } catch {
    // Authentication succeeded; a transient audit/profile write must not turn
    // the valid request into an authentication failure.
    console.error("external_principal_upsert_failed", { code: "database_error" });
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
  const token = extractBearerToken(request);
  return token.startsWith(API_KEY_PREFIX) ? verifyApiKey(token) : verifyExternalToken(token);
}
