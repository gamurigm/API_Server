import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin-api";
import { providerRouteSchema } from "@/lib/admin-schemas";
import { adminErrorResponse, GatewayError } from "@/lib/errors";
import { parseRequestJson } from "@/lib/request-json";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const providerId = new URL(request.url).searchParams.get("provider_id");
  let query = createAdminClient().from("provider_routes").select("*").order("path_template");
  if (providerId) query = query.eq("provider_id", providerId);
  const { data, error } = await query;
  if (error) return adminErrorResponse(new GatewayError(503, "database_error", "Routes could not be loaded"));
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  try {
    const input = await parseRequestJson(request, providerRouteSchema);
    const { data, error } = await createAdminClient()
      .from("provider_routes")
      .insert(input)
      .select("*")
      .single();
    if (error) throw new GatewayError(400, "route_create_failed", error.code === "23505" ? "The method and path are already registered" : "Route could not be created");
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
