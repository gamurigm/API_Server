import { hashApiKey, isApiKey } from "@/lib/api-key-core";
import { GatewayError } from "@/lib/errors";
import { findApiKeyByHash, findApplicationStatus } from "@/lib/db/consumer";
import type { ExternalPrincipal } from "@/types/gateway";

export async function verifyApiKey(key: string): Promise<ExternalPrincipal> {
  const invalid = () => new GatewayError(401, "invalid_api_key", "The gateway access key is invalid, expired or revoked");
  if (!isApiKey(key)) throw invalid();

  // No cache: revocation takes effect on the next authentication attempt.
  let data;
  try {
    data = await findApiKeyByHash(hashApiKey(key));
  } catch {
    throw new GatewayError(503, "identity_store_unavailable", "Access key verification is unavailable", false);
  }
  if (!data || data.revoked_at ||
    (data.expires_at && !(Date.parse(data.expires_at) > Date.now()))) throw invalid();

  let application;
  try {
    application = await findApplicationStatus(data.consumer_application_id);
  } catch {
    throw new GatewayError(503, "identity_store_unavailable", "Application verification is unavailable", false);
  }
  if (!application?.enabled) throw new GatewayError(403, "application_disabled", "The consuming application is disabled");

  return {
    applicationId: application.id,
    identityProviderId: null,
    apiKeyId: data.id,
    issuer: "gateway:api-key",
    // All keys of an app share its per-provider quota and stream limit.
    subject: `application:${application.id}`,
    scopes: data.scopes,
    roles: [],
    claims: {},
  };
}
