import type { Provider, ProviderRoute } from "@/types/gateway";
import { GatewayError } from "@/lib/errors";

const BASE_REQUEST_HEADERS = new Set(["accept", "content-type", "idempotency-key"]);
const BASE_RESPONSE_HEADERS = new Set([
  "cache-control",
  "content-language",
  "content-type",
  "etag",
  "last-modified",
  "retry-after",
]);
const FORBIDDEN_HEADERS = new Set([
  "authorization",
  "connection",
  "cookie",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "set-cookie",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
]);

export function normalizePathSegments(segments: string[]): string[] {
  if (segments.length === 0) {
    throw new GatewayError(404, "route_not_found", "No upstream route was provided");
  }

  return segments.map((segment) => {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw new GatewayError(400, "invalid_path", "The request path contains invalid encoding");
    }
    if (
      !decoded ||
      decoded === "." ||
      decoded === ".." ||
      decoded.includes("/") ||
      decoded.includes("\\") ||
      decoded.includes("\0")
    ) {
      throw new GatewayError(400, "invalid_path", "The request path is not allowed");
    }
    return decoded;
  });
}

export function routeMatches(template: string, actualPath: string): boolean {
  const templateSegments = template.split("/").filter(Boolean);
  const actualSegments = actualPath.split("/").filter(Boolean);
  if (templateSegments.length !== actualSegments.length) {
    return false;
  }

  return templateSegments.every((segment, index) => {
    if (/^\{[A-Za-z_][A-Za-z0-9_-]*\}$/u.test(segment)) {
      return actualSegments[index].length > 0;
    }
    return segment === actualSegments[index];
  });
}

export function findMatchingRoute(
  routes: ProviderRoute[],
  method: string,
  actualPath: string,
): ProviderRoute | undefined {
  return routes.find(
    (route) => route.enabled && route.method === method && routeMatches(route.path_template, actualPath),
  );
}

export function buildUpstreamUrl(baseUrl: URL, segments: string[], incoming: URL): URL {
  const upstream = new URL(baseUrl.toString());
  const basePath = upstream.pathname.replace(/\/$/u, "");
  upstream.pathname = `${basePath}/${segments.map(encodeURIComponent).join("/")}`;
  upstream.search = incoming.search;
  return upstream;
}

function safeAdditionalHeaders(values: string[]): Set<string> {
  return new Set(
    values
      .map((value) => value.toLowerCase())
      .filter((value) => !FORBIDDEN_HEADERS.has(value)),
  );
}

export function buildUpstreamHeaders(request: Request, route: ProviderRoute): Headers {
  const allowed = new Set([
    ...BASE_REQUEST_HEADERS,
    ...safeAdditionalHeaders(route.allowed_request_headers),
  ]);
  const headers = new Headers();
  for (const [name, value] of request.headers.entries()) {
    const normalized = name.toLowerCase();
    if (allowed.has(normalized) && !FORBIDDEN_HEADERS.has(normalized)) {
      headers.set(name, value);
    }
  }
  headers.set("User-Agent", "FederatedApiGateway/0.1");
  return headers;
}

export function filterUpstreamResponseHeaders(
  source: Headers,
  route: ProviderRoute,
): Headers {
  const allowed = new Set([
    ...BASE_RESPONSE_HEADERS,
    ...safeAdditionalHeaders(route.allowed_response_headers),
  ]);
  const headers = new Headers();
  for (const [name, value] of source.entries()) {
    const normalized = name.toLowerCase();
    if (allowed.has(normalized) && !FORBIDDEN_HEADERS.has(normalized)) {
      headers.set(name, value);
    }
  }
  // Provider responses can contain account-specific or paid data. Never let an
  // intermediary cache a response merely because the upstream API allows it.
  headers.set("Cache-Control", "no-store");
  return headers;
}

function assertSafeCredentialName(name: string, kind: "header" | "query"): string {
  const valid = kind === "header"
    ? /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(name)
    : /^[A-Za-z0-9_.~-]+$/u.test(name);
  if (!valid || FORBIDDEN_HEADERS.has(name.toLowerCase())) {
    throw new GatewayError(500, "invalid_provider_auth_config", "Provider authentication is misconfigured", false);
  }
  return name;
}

export function injectProviderCredential(
  provider: Provider,
  headers: Headers,
  url: URL,
  secret: string | null,
): void {
  if (provider.auth_type === "none") {
    return;
  }
  if (!secret) {
    throw new GatewayError(503, "provider_credential_missing", "No credential is configured for this provider", false);
  }

  if (provider.auth_type === "bearer_static") {
    headers.set("Authorization", `Bearer ${secret}`);
    return;
  }

  if (provider.auth_type === "api_key_header") {
    const headerName = assertSafeCredentialName(
      String(provider.auth_config.headerName ?? "X-API-Key"),
      "header",
    );
    const prefix = typeof provider.auth_config.prefix === "string" ? provider.auth_config.prefix : "";
    headers.set(headerName, `${prefix}${secret}`);
    return;
  }

  const queryName = assertSafeCredentialName(
    String(provider.auth_config.queryName ?? "api_key"),
    "query",
  );
  url.searchParams.set(queryName, secret);
}

export function hasRequiredScopes(principalScopes: string[], requiredScopes: string[]): boolean {
  const available = new Set(principalScopes);
  return requiredScopes.every((scope) => available.has(scope));
}
