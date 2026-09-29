import { handleCorsPreflight } from "@/lib/cors";
import { GatewayError } from "@/lib/errors";
import { handleGatewayRequest } from "@/lib/gateway-handler";

const PREFIX = "/api/v1/gateway/";

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new GatewayError(400, "invalid_path", "The gateway path contains invalid URL encoding");
  }
}

export function routeParametersFromRequest(request: Request): { provider: string; path: string[] } {
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith(PREFIX)) {
    throw new GatewayError(404, "route_not_found", "The gateway route does not exist");
  }

  const [provider, ...path] = pathname.slice(PREFIX.length).split("/");
  if (!provider || path.length === 0) {
    throw new GatewayError(404, "route_not_found", "The gateway route does not exist");
  }

  return {
    provider: decodePathSegment(provider),
    path: path.map(decodePathSegment),
  };
}

export async function handleGatewayRoute(request: Request): Promise<Response> {
  try {
    return await handleGatewayRequest(request, routeParametersFromRequest(request));
  } catch (error) {
    const requestId = crypto.randomUUID();
    const known = error instanceof GatewayError ? error : new GatewayError(500, "internal_error", "Unexpected gateway error", false);
    return Response.json(
      { error: { code: known.code, message: known.expose ? known.message : "Unexpected gateway error", requestId } },
      { status: known.status, headers: { "Cache-Control": "no-store", "X-Gateway-Request-Id": requestId } },
    );
  }
}

export const handleGatewayOptions = handleCorsPreflight;
