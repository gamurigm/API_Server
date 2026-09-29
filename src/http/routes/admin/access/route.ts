import { requireAdminApi } from "@/lib/admin-api";
import { providerAccessSchema } from "@/lib/admin-schemas";
import { adminErrorResponse, GatewayError } from "@/lib/errors";
import { parseRequestJson } from "@/lib/request-json";
import { listAccess, upsertAccess } from "@/lib/db/admin-catalog";


export async function GET(request: Request) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;
  try {
    return Response.json({ data: await listAccess() });
  } catch {
    return adminErrorResponse(new GatewayError(503, "database_error", "Access rules could not be loaded"));
  }
}

export async function POST(request: Request) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;
  try {
    const input = await parseRequestJson(request, providerAccessSchema);
    const data = await upsertAccess(input);
    return Response.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof GatewayError) return adminErrorResponse(error);
    return adminErrorResponse(new GatewayError(503, "access_update_failed", "Access rule could not be saved"));
  }
}
