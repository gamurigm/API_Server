import { NextResponse } from "next/server";

import { gatewayErrorResponse } from "@/lib/errors";
import { corsHeadersForRequest, handleCorsPreflight } from "@/lib/cors";
import { authenticateExternalRequest } from "@/lib/jwt";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  let corsHeaders: Record<string, string> = {};
  try {
    corsHeaders = await corsHeadersForRequest(request);
    const principal = await authenticateExternalRequest(request);
    corsHeaders = await corsHeadersForRequest(request, principal.applicationId);
    const admin = createAdminClient();
    const { data: access, error: accessError } = await admin
      .from("application_provider_access")
      .select("provider_id, rate_limit_per_minute")
      .eq("consumer_application_id", principal.applicationId)
      .eq("enabled", true);
    if (accessError) throw accessError;

    const providerIds = (access ?? []).map((entry) => entry.provider_id as string);
    if (providerIds.length === 0) {
      return NextResponse.json(
        { data: [] },
        { headers: { ...corsHeaders, "Cache-Control": "no-store", "X-Gateway-Request-Id": requestId } },
      );
    }
    const [{ data: providers, error: providerError }, { data: routes, error: routeError }] =
      await Promise.all([
        admin
          .from("providers")
          .select("id, name, slug, description")
          .in("id", providerIds)
          .eq("enabled", true)
          .order("name"),
        admin
          .from("provider_routes")
          .select("provider_id, method, path_template, operation_id, description, required_scopes, supports_sse")
          .in("provider_id", providerIds)
          .eq("enabled", true)
          .order("path_template"),
      ]);
    if (providerError || routeError) throw providerError ?? routeError;

    return NextResponse.json(
      {
        data: (providers ?? []).map((provider) => ({
          ...provider,
          routes: (routes ?? []).filter((route) => route.provider_id === provider.id),
        })),
      },
      { headers: { ...corsHeaders, "Cache-Control": "no-store", "X-Gateway-Request-Id": requestId } },
    );
  } catch (error) {
    return gatewayErrorResponse(error, requestId, corsHeaders);
  }
}

export const OPTIONS = handleCorsPreflight;
