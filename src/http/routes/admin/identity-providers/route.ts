import { requireAdminApi } from "@/lib/admin-api";
import { identityProviderSchema } from "@/lib/admin-schemas";
import { adminErrorResponse, GatewayError } from "@/lib/errors";
import { assertPublicProviderUrl } from "@/lib/network-security";
import { parseRequestJson } from "@/lib/request-json";
import { createIdentityProvider, isUniqueViolation, listIdentityProviders } from "@/lib/db/admin-catalog";


export async function GET(request: Request) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;
  try {
    return Response.json({ data: await listIdentityProviders() });
  } catch {
    return adminErrorResponse(new GatewayError(503, "database_error", "Identity providers could not be loaded"));
  }
}

export async function POST(request: Request) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;
  try {
    const input = await parseRequestJson(request, identityProviderSchema);
    await Promise.all([
      assertPublicProviderUrl(input.issuer),
      assertPublicProviderUrl(input.jwks_uri),
    ]);
    const data = await createIdentityProvider(input);
    return Response.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof GatewayError) return adminErrorResponse(error);
    return adminErrorResponse(new GatewayError(isUniqueViolation(error) ? 400 : 503,
      "identity_provider_create_failed", isUniqueViolation(error) ? "This issuer is already registered for the application" : "Identity provider could not be created"));
  }
}
