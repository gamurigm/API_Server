import { requireAdminApi } from "@/lib/admin-api";
import { applicationOriginSchema } from "@/lib/admin-schemas";
import { adminErrorResponse, GatewayError } from "@/lib/errors";
import { parseRequestJson } from "@/lib/request-json";
import { listOrigins, upsertOrigin } from "@/lib/db/admin-catalog";


function normalizeOrigin(value: string): string {
  const url = new URL(value);
  const isLocalDevelopment =
    url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !isLocalDevelopment) {
    throw new GatewayError(400, "invalid_origin", "Browser origins must use HTTPS, except localhost development");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new GatewayError(400, "invalid_origin", "Origin must contain only scheme, host and optional port");
  }
  return url.origin;
}

export async function GET(request: Request) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;
  try {
    return Response.json({ data: await listOrigins() });
  } catch {
    return adminErrorResponse(new GatewayError(503, "database_error", "Browser origins could not be loaded"));
  }
}

export async function POST(request: Request) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;
  try {
    const input = await parseRequestJson(request, applicationOriginSchema);
    const data = await upsertOrigin({ ...input, origin: normalizeOrigin(input.origin) });
    return Response.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof GatewayError) return adminErrorResponse(error);
    return adminErrorResponse(new GatewayError(503, "origin_create_failed", "Browser origin could not be saved"));
  }
}
