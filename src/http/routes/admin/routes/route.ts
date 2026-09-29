import { z } from "zod";

import { requireAdminApi } from "@/lib/admin-api";
import { providerRouteSchema } from "@/lib/admin-schemas";
import { adminErrorResponse, GatewayError } from "@/lib/errors";
import { parseRequestJson } from "@/lib/request-json";
import { createRoute, isUniqueViolation, listRoutes } from "@/lib/db/admin-catalog";


export async function GET(request: Request) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;
  const providerId = new URL(request.url).searchParams.get("provider_id");
  if (providerId && !z.uuid().safeParse(providerId).success) {
    return adminErrorResponse(new GatewayError(400, "invalid_provider_id", "Invalid provider identifier"));
  }
  try {
    return Response.json({ data: await listRoutes(providerId) });
  } catch {
    return adminErrorResponse(new GatewayError(503, "database_error", "Routes could not be loaded"));
  }
}

export async function POST(request: Request) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;
  try {
    const input = await parseRequestJson(request, providerRouteSchema);
    const data = await createRoute(input);
    return Response.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof GatewayError) return adminErrorResponse(error);
    return adminErrorResponse(new GatewayError(isUniqueViolation(error) ? 400 : 503,
      "route_create_failed", isUniqueViolation(error) ? "The method and path are already registered" : "Route could not be created"));
  }
}
