import "server-only";

import { GatewayError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";

const CORS_HEADERS = "Authorization, Content-Type, Idempotency-Key";
const CORS_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const BLOCKED_CORS_HEADERS = new Set([
  "connection",
  "cookie",
  "host",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function allowedCorsHeaders(request: Request): string {
  const requested = request.headers.get("access-control-request-headers");
  if (!requested) return CORS_HEADERS;

  const names = requested.split(",").map((name) => name.trim()).filter(Boolean);
  if (names.some((name) =>
    !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(name) || BLOCKED_CORS_HEADERS.has(name.toLowerCase())
  )) {
    throw new GatewayError(403, "cors_headers_not_allowed", "A requested browser header is not allowed");
  }

  return [...new Set([...CORS_HEADERS.split(", "), ...names])].join(", ");
}

function originFromRequest(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  try {
    const parsed = new URL(origin);
    if (origin !== parsed.origin) {
      throw new Error("Origin contains components other than scheme, host and port");
    }
    return parsed.origin;
  } catch {
    throw new GatewayError(403, "origin_not_allowed", "Browser origin is invalid");
  }
}

export async function corsHeadersForRequest(
  request: Request,
  applicationId?: string,
): Promise<Record<string, string>> {
  const origin = originFromRequest(request);
  if (!origin) return {};

  let query = createAdminClient()
    .from("application_origins")
    .select("consumer_application_id")
    .eq("origin", origin)
    .eq("enabled", true);
  if (applicationId) query = query.eq("consumer_application_id", applicationId);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error || !data) {
    throw new GatewayError(403, "origin_not_allowed", "Browser origin is not registered for this application");
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": allowedCorsHeaders(request),
    "Access-Control-Allow-Methods": CORS_METHODS,
    "Access-Control-Expose-Headers": "X-Gateway-Request-Id, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export async function handleCorsPreflight(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const headers = await corsHeadersForRequest(request);
    return new Response(null, {
      status: 204,
      headers: { ...headers, "X-Gateway-Request-Id": requestId },
    });
  } catch (error) {
    const known = error instanceof GatewayError ? error : new GatewayError(500, "internal_error", "Unexpected gateway error", false);
    return Response.json(
      { error: { code: known.code, message: known.expose ? known.message : "Unexpected gateway error", requestId } },
      { status: known.status, headers: { "X-Gateway-Request-Id": requestId } },
    );
  }
}
