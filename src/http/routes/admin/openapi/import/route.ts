import { parse as parseYaml } from "yaml";

import { requireAdminApi } from "@/lib/admin-api";
import { assertAdminKeyMutation } from "@/lib/admin-key-request";
import { openApiImportSchema } from "@/lib/admin-schemas";
import { importOpenApiRoutes, type ImportedRoute } from "@/lib/db/openapi-import";
import { adminErrorResponse, GatewayError } from "@/lib/errors";
import { parseRequestJson } from "@/lib/request-json";

const METHODS = ["get", "post", "put", "patch", "delete"] as const;
const DATABASE_CONNECTION_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "57P01",
  "57P02",
  "57P03",
  "53300",
]);

function postgresErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

function isDatabaseUnavailable(error: unknown): boolean {
  let cause = error;
  while (cause instanceof Error) {
    const code = postgresErrorCode(cause);
    if (code?.startsWith("08") || (code && DATABASE_CONNECTION_CODES.has(code)) ||
      cause.message === "timeout exceeded when trying to connect") {
      return true;
    }
    cause = cause.cause;
  }
  return false;
}

function isDatabaseConstraintViolation(error: unknown): boolean {
  let cause = error;
  while (cause instanceof Error) {
    if (postgresErrorCode(cause)?.startsWith("23")) return true;
    cause = cause.cause;
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function operationScopes(document: Record<string, unknown>, operation: Record<string, unknown>): string[] {
  const security = operation.security ?? document.security;
  if (!Array.isArray(security)) return [];
  const scopes = new Set<string>();
  for (const requirement of security) {
    if (!isRecord(requirement)) continue;
    for (const values of Object.values(requirement)) {
      if (Array.isArray(values)) {
        for (const value of values) if (typeof value === "string") scopes.add(value);
      }
    }
  }
  return [...scopes];
}

function supportsSse(operation: Record<string, unknown>): boolean {
  if (!isRecord(operation.responses)) return false;
  return Object.values(operation.responses).some((response) => {
    if (!isRecord(response) || !isRecord(response.content)) return false;
    return Object.keys(response.content).some((type) => type.toLowerCase() === "text/event-stream");
  });
}

export async function POST(request: Request) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  try {
    assertAdminKeyMutation(request);
    const input = await parseRequestJson(request, openApiImportSchema);
    let document: unknown = input.document;
    if (typeof document === "string") {
      try {
        document = parseYaml(document);
      } catch {
        throw new GatewayError(400, "invalid_openapi", "OpenAPI document is not valid JSON or YAML");
      }
    }
    if (!isRecord(document) || !isRecord(document.paths)) {
      throw new GatewayError(400, "invalid_openapi", "OpenAPI document must contain a paths object");
    }
    if (typeof document.openapi !== "string" || !document.openapi.startsWith("3.")) {
      throw new GatewayError(400, "unsupported_openapi", "Only OpenAPI 3.x documents are supported");
    }

    const routes: ImportedRoute[] = [];
    for (const [path, pathItem] of Object.entries(document.paths)) {
      if (!path.startsWith("/") || !isRecord(pathItem)) continue;
      for (const method of METHODS) {
        const operation = pathItem[method];
        if (!isRecord(operation)) continue;
        routes.push({
          provider_id: input.provider_id,
          method: method.toUpperCase(),
          path_template: path,
          operation_id:
            typeof operation.operationId === "string"
              ? operation.operationId
              : `${method}-${path.replace(/[^A-Za-z0-9]+/gu, "-").replace(/^-|-$/gu, "")}`,
          description:
            typeof operation.summary === "string"
              ? operation.summary
              : typeof operation.description === "string"
                ? operation.description.slice(0, 500)
                : null,
          required_scopes: operationScopes(document, operation),
          allowed_request_headers: [],
          allowed_response_headers: [],
          supports_sse: supportsSse(operation),
          enabled: true,
          source: "openapi",
        });
      }
    }
    if (routes.length === 0) {
      throw new GatewayError(400, "empty_openapi", "OpenAPI document contains no supported operations");
    }

    try {
      const imported = await importOpenApiRoutes(routes);
      return Response.json({ data: { imported } }, { status: 201 });
    } catch (error) {
      if (isDatabaseUnavailable(error)) {
        throw new GatewayError(503, "database_error", "OpenAPI routes could not be imported because the database is unavailable");
      }
      if (!isDatabaseConstraintViolation(error)) throw error;
      throw new GatewayError(400, "openapi_import_failed", "OpenAPI routes could not be imported");
    }
  } catch (error) {
    return adminErrorResponse(error);
  }
}
