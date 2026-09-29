import { requireAdminApi } from "@/lib/admin-api";
import { providerSchema } from "@/lib/admin-schemas";
import { adminErrorResponse, GatewayError } from "@/lib/errors";
import { assertPublicProviderUrl } from "@/lib/network-security";
import { parseRequestJson } from "@/lib/request-json";
import { createProvider, isUniqueViolation, listProviders } from "@/lib/db/admin-catalog";


export async function GET(request: Request) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;
  try {
    return Response.json({ data: await listProviders() });
  } catch {
    return adminErrorResponse(new GatewayError(503, "database_error", "Providers could not be loaded"));
  }
}

export async function POST(request: Request) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;
  try {
    const input = await parseRequestJson(request, providerSchema);
    const baseUrl = await assertPublicProviderUrl(input.base_url);
    const data = await createProvider({ ...input, base_url: baseUrl.toString() });
    return Response.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof GatewayError) return adminErrorResponse(error);
    return adminErrorResponse(new GatewayError(isUniqueViolation(error) ? 400 : 503,
      "provider_create_failed", isUniqueViolation(error) ? "Provider slug already exists" : "Provider could not be created"));
  }
}
