import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin-api";
import { providerAccessSchema } from "@/lib/admin-schemas";
import { adminErrorResponse, GatewayError } from "@/lib/errors";
import { parseRequestJson } from "@/lib/request-json";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const { data, error } = await createAdminClient()
    .from("application_provider_access")
    .select("*, consumer_applications(name, slug), providers(name, slug)")
    .order("created_at", { ascending: false });
  if (error) return adminErrorResponse(new GatewayError(503, "database_error", "Access rules could not be loaded"));
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  try {
    const input = await parseRequestJson(request, providerAccessSchema);
    const { data, error } = await createAdminClient()
      .from("application_provider_access")
      .upsert(input, { onConflict: "consumer_application_id,provider_id" })
      .select("*")
      .single();
    if (error) throw new GatewayError(400, "access_update_failed", "Access rule could not be saved");
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
