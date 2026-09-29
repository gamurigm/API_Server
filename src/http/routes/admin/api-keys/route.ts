import { requireAdminApi } from "@/lib/admin-api";
import { assertAdminKeyMutation } from "@/lib/admin-key-request";
import { applicationApiKeySchema } from "@/lib/admin-schemas";
import { generateApiKey } from "@/lib/api-key-core";
import { createApiKey, listApiKeys } from "@/lib/db/admin-api-keys";
import { adminErrorResponse, GatewayError } from "@/lib/errors";
import { parseRequestJson } from "@/lib/request-json";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request = new Request("http://127.0.0.1/")) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;
  try {
    return Response.json({ data: await listApiKeys() }, { headers });
  } catch {
    return adminErrorResponse(new GatewayError(503, "database_error", "Access keys could not be loaded"));
  }
}

export async function POST(request: Request) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;
  try {
    assertAdminKeyMutation(request);
    const input = await parseRequestJson(request, applicationApiKeySchema);
    const generated = generateApiKey();
    const data = await createApiKey({
      ...input,
      key_hash: generated.hash,
      key_prefix: generated.prefix,
    });
    if (!data) throw new GatewayError(400, "application_disabled", "Select an active application");
    // The only response that ever includes the full key.
    return Response.json({ data, key: generated.key }, { status: 201, headers });
  } catch (error) {
    return adminErrorResponse(error instanceof GatewayError ? error :
      new GatewayError(503, "key_create_failed", "Access key could not be created"));
  }
}
