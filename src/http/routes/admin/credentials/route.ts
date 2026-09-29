import { requireAdminApi } from "@/lib/admin-api";
import { credentialSchema } from "@/lib/admin-schemas";
import { adminErrorResponse, GatewayError } from "@/lib/errors";
import { parseRequestJson } from "@/lib/request-json";
import { createCredential, listCredentialMetadata } from "@/lib/db/credentials";


export async function GET(request: Request) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;
  try {
    return Response.json({ data: await listCredentialMetadata() });
  } catch {
    return adminErrorResponse(new GatewayError(503, "database_error", "Credential metadata could not be loaded"));
  }
}

export async function POST(request: Request) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;
  try {
    const input = await parseRequestJson(request, credentialSchema);
    if (input.owner_type === "shared" && input.consumer_application_id) {
      throw new GatewayError(400, "invalid_credential_owner", "Shared credentials cannot belong to an application");
    }
    if (input.owner_type === "application" && !input.consumer_application_id) {
      throw new GatewayError(400, "invalid_credential_owner", "Application credentials require an application");
    }

    const id = await createCredential(input);
    return Response.json({ data: { id } }, { status: 201 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
