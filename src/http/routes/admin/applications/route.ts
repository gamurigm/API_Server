import { requireAdminApi } from "@/lib/admin-api";
import { consumerApplicationSchema } from "@/lib/admin-schemas";
import { adminErrorResponse, GatewayError } from "@/lib/errors";
import { parseRequestJson } from "@/lib/request-json";
import { createApplication, isUniqueViolation, listApplications } from "@/lib/db/admin-catalog";


export async function GET(request: Request) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  try {
    return Response.json({ data: await listApplications() });
  } catch {
    return adminErrorResponse(new GatewayError(503, "database_error", "Applications could not be loaded"));
  }
}

export async function POST(request: Request) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  try {
    const input = await parseRequestJson(request, consumerApplicationSchema);
    const data = await createApplication(input);
    return Response.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof GatewayError) return adminErrorResponse(error);
    return adminErrorResponse(new GatewayError(isUniqueViolation(error) ? 400 : 503,
      "application_create_failed", isUniqueViolation(error) ? "Application slug already exists" : "Application could not be created"));
  }
}
