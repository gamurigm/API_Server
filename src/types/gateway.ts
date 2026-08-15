export type AuthType =
  | "none"
  | "api_key_header"
  | "api_key_query"
  | "bearer_static";

export interface ConsumerApplication {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  enabled: boolean;
  rate_limit_per_minute: number;
  created_at: string;
}

export interface IdentityProvider {
  id: string;
  consumer_application_id: string;
  name: string;
  issuer: string;
  jwks_uri: string;
  audiences: string[];
  scopes_claim: string;
  roles_claim: string;
  enabled: boolean;
  created_at: string;
}

export interface Provider {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  base_url: string;
  auth_type: AuthType;
  auth_config: Record<string, unknown>;
  timeout_ms: number;
  sse_timeout_ms: number;
  rate_limit_per_minute: number;
  enabled: boolean;
  created_at: string;
}

export interface ProviderRoute {
  id: string;
  provider_id: string;
  method: string;
  path_template: string;
  operation_id: string;
  description: string | null;
  required_scopes: string[];
  allowed_request_headers: string[];
  allowed_response_headers: string[];
  supports_sse: boolean;
  enabled: boolean;
  source: "manual" | "openapi";
  created_at: string;
}

export interface ApplicationProviderAccess {
  id: string;
  consumer_application_id: string;
  provider_id: string;
  enabled: boolean;
  rate_limit_per_minute: number | null;
}

export interface CredentialMetadata {
  id: string;
  provider_id: string;
  owner_type: "shared" | "application";
  consumer_application_id: string | null;
  label: string;
  vault_secret_id: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExternalPrincipal {
  applicationId: string;
  identityProviderId: string;
  issuer: string;
  subject: string;
  scopes: string[];
  roles: string[];
  claims: Record<string, unknown>;
}

export interface GatewayErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset_at: string;
}
