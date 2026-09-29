import { requireAdminApi } from "@/lib/admin-api";
import { adminErrorResponse, GatewayError } from "@/lib/errors";
import { listAudit } from "@/lib/db/admin-catalog";


export async function GET(request: Request) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;
  const rawLimit = Number(new URL(request.url).searchParams.get("limit") ?? 100);
  const limit = Math.trunc(Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 100, 1), 500));
  try {
    return Response.json({ data: await listAudit(limit) });
  } catch {
    return adminErrorResponse(new GatewayError(503, "database_error", "Audit events could not be loaded"));
  }
}
