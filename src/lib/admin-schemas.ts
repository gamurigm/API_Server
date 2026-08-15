import { z } from "zod";

const slug = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, "Use lowercase letters, numbers and hyphens");

export const consumerApplicationSchema = z.object({
  name: z.string().min(2).max(120),
  slug,
  description: z.string().max(500).nullable().optional(),
  rate_limit_per_minute: z.coerce.number().int().min(1).max(100_000).default(60),
  enabled: z.boolean().default(true),
});

export const identityProviderSchema = z.object({
  consumer_application_id: z.uuid(),
  name: z.string().min(2).max(120),
  issuer: z.url(),
  jwks_uri: z.url(),
  audiences: z.array(z.string().min(1).max(250)).min(1).max(10),
  scopes_claim: z.string().min(1).max(80).default("scope"),
  roles_claim: z.string().min(1).max(80).default("roles"),
  enabled: z.boolean().default(true),
});

export const providerSchema = z
  .object({
    name: z.string().min(2).max(120),
    slug,
    description: z.string().max(500).nullable().optional(),
    base_url: z.url(),
    auth_type: z.enum(["none", "api_key_header", "api_key_query", "bearer_static"]),
    auth_config: z.record(z.string(), z.unknown()).default({}),
    timeout_ms: z.coerce.number().int().min(1000).max(25_000).default(25_000),
    sse_timeout_ms: z.coerce.number().int().min(1000).max(300_000).default(300_000),
    rate_limit_per_minute: z.coerce.number().int().min(1).max(100_000).default(60),
    enabled: z.boolean().default(true),
  })
  .superRefine((value, context) => {
    if (value.auth_type === "api_key_header") {
      const headerName = value.auth_config.headerName;
      if (headerName !== undefined && typeof headerName !== "string") {
        context.addIssue({ code: "custom", path: ["auth_config", "headerName"], message: "headerName must be a string" });
      }
    }
    if (value.auth_type === "api_key_query") {
      const queryName = value.auth_config.queryName;
      if (queryName !== undefined && typeof queryName !== "string") {
        context.addIssue({ code: "custom", path: ["auth_config", "queryName"], message: "queryName must be a string" });
      }
    }
  });

export const providerRouteSchema = z.object({
  provider_id: z.uuid(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  path_template: z.string().startsWith("/").max(500),
  operation_id: z.string().min(1).max(160),
  description: z.string().max(500).nullable().optional(),
  required_scopes: z.array(z.string().min(1).max(160)).max(30).default([]),
  allowed_request_headers: z.array(z.string().min(1).max(100)).max(30).default([]),
  allowed_response_headers: z.array(z.string().min(1).max(100)).max(30).default([]),
  supports_sse: z.boolean().default(false),
  enabled: z.boolean().default(true),
  source: z.enum(["manual", "openapi"]).default("manual"),
});

export const providerAccessSchema = z.object({
  consumer_application_id: z.uuid(),
  provider_id: z.uuid(),
  enabled: z.boolean().default(true),
  rate_limit_per_minute: z.coerce.number().int().min(1).max(100_000).nullable().optional(),
});

export const applicationOriginSchema = z.object({
  consumer_application_id: z.uuid(),
  origin: z.url(),
  enabled: z.boolean().default(true),
});

export const credentialSchema = z.object({
  provider_id: z.uuid(),
  owner_type: z.enum(["shared", "application"]),
  consumer_application_id: z.uuid().nullable().optional(),
  label: z.string().min(2).max(120),
  secret: z.string().min(1).max(20_000),
});

export const openApiImportSchema = z.object({
  provider_id: z.uuid(),
  document: z.union([z.string().min(1).max(2_000_000), z.record(z.string(), z.unknown())]),
});

export const enabledPatchSchema = z.object({
  enabled: z.boolean(),
});
