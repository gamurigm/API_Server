import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin-api";
import { adminErrorResponse, GatewayError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const rawLimit = Number(new URL(request.url).searchParams.get("limit") ?? 100);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 100, 1), 500);
  const { data, error } = await createAdminClient()
    .from("invocations")
    .select("*, consumer_applications(name, slug), providers(name, slug), provider_routes(operation_id)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return adminErrorResponse(new GatewayError(503, "database_error", "Audit events could not be loaded"));
  return NextResponse.json({ data });
}
