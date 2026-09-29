import { z } from "zod";

import { requireAdminApi } from "@/lib/admin-api";
import { assertAdminKeyMutation } from "@/lib/admin-key-request";
import { enabledPatchSchema } from "@/lib/admin-schemas";
import { adminErrorResponse, GatewayError } from "@/lib/errors";
import { parseRequestJson } from "@/lib/request-json";
import { deleteCredential, setCredentialEnabled } from "@/lib/db/credentials";
import { isCatalogResource, setResourceEnabled } from "@/lib/db/admin-catalog";

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
    const input = await parseRequestJson(request, enabledPatchSchema);
    if (resource === "credentials") {
      const data = await setCredentialEnabled(id, input.enabled);
      if (!data) throw new GatewayError(404, "resource_not_found", "Credential is retired or missing");
      return Response.json({ data });
    }
    const data = await setResourceEnabled(resource, id, input.enabled);
    if (!data) throw new GatewayError(404, "resource_not_found", "Resource could not be updated");
    return Response.json({ data });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function DELETE(request: Request, resource: string, id: string) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;
  try {
    assertAdminKeyMutation(request);
    if (resource !== "credentials") {
      throw new GatewayError(404, "resource_not_found", "Administrative resource is not supported");
    }
    if (!z.uuid().safeParse(id).success) {
      throw new GatewayError(400, "invalid_resource_id", "Invalid resource identifier");
    }
    if (!await deleteCredential(id)) {
      throw new GatewayError(404, "resource_not_found", "Credential not found");
    }
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof GatewayError) return adminErrorResponse(error);
    console.error("credential_delete_failed", { credentialId: id });
    return adminErrorResponse(new GatewayError(503, "credential_delete_failed", "Credential deletion could not be completed"));
  }
}
