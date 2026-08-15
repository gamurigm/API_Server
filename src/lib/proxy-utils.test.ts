import { describe, expect, it } from "vitest";

import {
  buildUpstreamHeaders,
  buildUpstreamUrl,
  filterUpstreamResponseHeaders,
  hasRequiredScopes,
  injectProviderCredential,
  normalizePathSegments,
  routeMatches,
} from "@/lib/proxy-utils";
import type { Provider, ProviderRoute } from "@/types/gateway";

const route = {
  allowed_request_headers: ["X-Correlation-Id", "Authorization", "Cookie"],
  allowed_response_headers: ["X-Provider-Limit", "Set-Cookie"],
} as ProviderRoute;

function provider(authType: Provider["auth_type"], config: Record<string, unknown> = {}): Provider {
  return { auth_type: authType, auth_config: config } as Provider;
}

describe("route matching and path normalization", () => {
  it("matches OpenAPI path parameters but not extra segments", () => {
    expect(routeMatches("/quotes/{symbol}", "/quotes/NVDA")).toBe(true);
    expect(routeMatches("/quotes/{symbol}", "/quotes/NVDA/history")).toBe(false);
    expect(routeMatches("/quotes/{symbol}", "/users/NVDA")).toBe(false);
  });

  it("rejects traversal and encoded slashes", () => {
    expect(() => normalizePathSegments(["quotes", ".."]).join("/")).toThrowError(/not allowed/u);
    expect(() => normalizePathSegments(["quotes", "%2Fadmin"]).join("/")).toThrowError(/not allowed/u);
  });
});

describe("proxy headers and credentials", () => {
  it("allows safe headers and strips gateway credentials and cookies", () => {
    const request = new Request("https://gateway.test", {
      headers: {
        Accept: "application/json",
        Authorization: "Bearer user-token",
        Cookie: "session=secret",
        "X-Correlation-Id": "abc",
        "X-Unlisted": "blocked",
      },
    });
    const headers = buildUpstreamHeaders(request, route);
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("x-correlation-id")).toBe("abc");
    expect(headers.has("authorization")).toBe(false);
    expect(headers.has("cookie")).toBe(false);
    expect(headers.has("x-unlisted")).toBe(false);
  });

  it("strips Set-Cookie even if a route tries to allow it", () => {
    const source = new Headers({
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "application/json",
      "Set-Cookie": "token=bad",
      "X-Provider-Limit": "8",
    });
    const headers = filterUpstreamResponseHeaders(source, route);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-provider-limit")).toBe("8");
    expect(headers.has("set-cookie")).toBe(false);
    expect(headers.get("cache-control")).toBe("no-store");
  });

  it("injects Bearer, header and query credentials only at the gateway", () => {
    const url = new URL("https://api.example.com/quotes");
    const headers = new Headers();
    injectProviderCredential(provider("bearer_static"), headers, url, "secret-one");
    expect(headers.get("authorization")).toBe("Bearer secret-one");

    injectProviderCredential(provider("api_key_header", { headerName: "X-API-Key" }), headers, url, "secret-two");
    expect(headers.get("x-api-key")).toBe("secret-two");

    injectProviderCredential(provider("api_key_query", { queryName: "apikey" }), headers, url, "secret-three");
    expect(url.searchParams.get("apikey")).toBe("secret-three");
  });
});

describe("upstream URL and scopes", () => {
  it("keeps the registered base path, path segments and query", () => {
    const incoming = new URL("https://gateway.test/api/v1/gateway/market/quotes/NVDA?interval=1d");
    const result = buildUpstreamUrl(new URL("https://api.example.com/v1/"), ["quotes", "NVDA"], incoming);
    expect(result.toString()).toBe("https://api.example.com/v1/quotes/NVDA?interval=1d");
  });

  it("requires every route scope", () => {
    expect(hasRequiredScopes(["quotes:read", "profile"], ["quotes:read"])).toBe(true);
    expect(hasRequiredScopes(["profile"], ["quotes:read"])).toBe(false);
  });
});
