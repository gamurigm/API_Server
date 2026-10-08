import { z } from "zod";

import { requireAdminApi } from "@/lib/admin-api";
import { assertAdminKeyMutation } from "@/lib/admin-key-request";
import {
  applicationOriginPatchSchema,
  applicationPatchSchema,
  enabledPatchSchema,
  identityProviderPatchSchema,
  providerAccessPatchSchema,
  providerPatchSchema,
  providerRoutePatchSchema,
} from "@/lib/admin-schemas";
import { adminErrorResponse, GatewayError } from "@/lib/errors";
import { assertPublicProviderUrl } from "@/lib/network-security";
import { parseRequestJson } from "@/lib/request-json";
import { deleteCredential, setCredentialEnabled } from "@/lib/db/credentials";
import {
  deleteCatalogResource,
  isCatalogResource,
  isDeletableCatalogResource,
  isUniqueViolation,
  updateCatalogResource,
} from "@/lib/db/admin-catalog";

const patchSchemas = {
  applications: applicationPatchSchema,
  "identity-providers": identityProviderPatchSchema,
  providers: providerPatchSchema,
  routes: providerRoutePatchSchema,
  access: providerAccessPatchSchema,
  origins: applicationOriginPatchSchema,
} as const;

export async function PATCH(request: Request, resource: string, id: string) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;
  try {
    if (!z.uuid().safeParse(id).success) {
      throw new GatewayError(400, "invalid_resource_id", "Invalid resource identifier");
    }
    if (resource !== "credentials" && !isCatalogResource(resource)) {
      throw new GatewayError(404, "resource_not_found", "Administrative resource is not supported");
    }
    if (resource === "credentials") {
      const input = await parseRequestJson(request, enabledPatchSchema);
      const data = await setCredentialEnabled(id, input.enabled);
      if (!data) throw new GatewayError(404, "resource_not_found", "Credential is retired or missing");
      return Response.json({ data });
    }

    const patchSchema = patchSchemas[resource as keyof typeof patchSchemas];
    if (!patchSchema) throw new GatewayError(404, "resource_not_found", "Administrative resource is not supported");
    const input = await parseRequestJson(request, patchSchema) as Record<string, unknown>;
    if (resource === "providers" && typeof input.base_url === "string") {
      await assertPublicProviderUrl(input.base_url);
    }
    if (resource === "identity-providers") {
      await Promise.all([
        typeof input.issuer === "string" ? assertPublicProviderUrl(input.issuer) : undefined,
        typeof input.jwks_uri === "string" ? assertPublicProviderUrl(input.jwks_uri) : undefined,
      ]);
    }
    const data = await updateCatalogResource(resource, id, input as Record<string, unknown>);
    if (!data) throw new GatewayError(404, "resource_not_found", "Resource could not be updated");
    return Response.json({ data });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return adminErrorResponse(new GatewayError(400, "resource_conflict", "A resource with those values already exists"));
    }
    return adminErrorResponse(error);
  }
}

export async function DELETE(request: Request, resource: string, id: string) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;
  try {
    assertAdminKeyMutation(request);
    if (resource !== "credentials" && !isDeletableCatalogResource(resource)) {
      throw new GatewayError(404, "resource_not_found", "Administrative resource is not supported");
    }
    if (!z.uuid().safeParse(id).success) {
      throw new GatewayError(400, "invalid_resource_id", "Invalid resource identifier");
    }
    const deleted = resource === "credentials"
      ? await deleteCredential(id)
      : await deleteCatalogResource(resource, id);
    if (!deleted) {
      throw new GatewayError(404, "resource_not_found", "Administrative resource not found");
    }
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof GatewayError) return adminErrorResponse(error);
    console.error("admin_resource_delete_failed", { resource });
    return adminErrorResponse(new GatewayError(503, "resource_delete_failed", "Administrative resource could not be deleted"));
  }
}
