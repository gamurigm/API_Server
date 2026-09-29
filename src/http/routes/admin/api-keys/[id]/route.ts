import { z } from "zod";

import { requireAdminApi } from "@/lib/admin-api";
import { assertAdminKeyMutation } from "@/lib/admin-key-request";
import { revokeApiKey } from "@/lib/db/admin-api-keys";
import { adminErrorResponse, GatewayError } from "@/lib/errors";

export async function DELETE(request: Request, id: string) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;
  try {
    assertAdminKeyMutation(request);
    if (!z.uuid().safeParse(id).success) throw new GatewayError(400, "invalid_key_id", "Invalid access key identifier");
    try {
      await revokeApiKey(id);
    } catch {
      throw new GatewayError(503, "key_revoke_failed", "Access key could not be revoked");
    }
    // Idempotent; preserve the metadata and audit history.
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
