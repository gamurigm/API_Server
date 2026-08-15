import { NextResponse } from "next/server";
import { parse as parseYaml } from "yaml";

import { requireAdminApi } from "@/lib/admin-api";
import { openApiImportSchema } from "@/lib/admin-schemas";
import { adminErrorResponse, GatewayError } from "@/lib/errors";
import { parseRequestJson } from "@/lib/request-json";
import { createAdminClient } from "@/lib/supabase/admin";

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

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
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  try {
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

    const routes: Record<string, unknown>[] = [];
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

    const admin = createAdminClient();
    const { data: imported, error } = await admin
      .from("provider_routes")
      .upsert(routes, { onConflict: "provider_id,method,path_template" })
      .select("id");
    if (error) throw new GatewayError(400, "openapi_import_failed", "OpenAPI routes could not be imported");
    return NextResponse.json({ data: { imported: imported?.length ?? routes.length } }, { status: 201 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
