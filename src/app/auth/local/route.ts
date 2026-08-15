import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

function isLoopback(hostname: string): boolean {
  return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname.toLowerCase());
}

function loopbackOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return isLoopback(url.hostname) && ["http:", "https:"].includes(url.protocol)
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

function matchesLocalEndpoint(value: string, configuredOrigin: string): boolean {
  try {
    const source = new URL(value);
    const configured = new URL(configuredOrigin);
    return isLoopback(source.hostname) &&
      source.protocol === configured.protocol &&
      source.port === configured.port;
  } catch {
    return false;
  }
}

function noStoreRedirect(url: URL): NextResponse {
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const localRequest = request.headers.get("x-local-login") === "1";
  const appOrigin = loopbackOrigin(process.env.NEXT_PUBLIC_APP_URL);
  const supabaseOrigin = loopbackOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const enabled = process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_ENABLE_LOCAL_ADMIN_LOGIN === "true";

  if (!enabled || !isLoopback(requestUrl.hostname) || !appOrigin || !supabaseOrigin) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Local login is unavailable" } },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const trustedOrigin = Boolean(origin && matchesLocalEndpoint(origin, appOrigin));
  const originIsSafe = origin === null || trustedOrigin;
  const fetchSiteIsSafe = fetchSite === null || fetchSite === "same-origin";

  if (!localRequest || !originIsSafe || !fetchSiteIsSafe ||
      !contentType.startsWith("application/x-www-form-urlencoded")) {
    if (request.headers.get("accept")?.includes("text/html")) {
      return noStoreRedirect(new URL("/login?error=local_login_request_rejected", appOrigin));
    }
    return NextResponse.json(
      { error: { code: "forbidden", message: "Same-origin form submission required" } },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const email = process.env.LOCAL_ADMIN_EMAIL;
  const password = process.env.LOCAL_ADMIN_PASSWORD;
  if (!email || !password) {
    return NextResponse.json(
      { error: { code: "local_login_not_configured", message: "Local login is not configured" } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return NextResponse.json(
      { error: { code: "local_login_failed", message: "Local login failed" } },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
