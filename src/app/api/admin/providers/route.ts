import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin-api";
import { providerSchema } from "@/lib/admin-schemas";
import { adminErrorResponse, GatewayError } from "@/lib/errors";
import { assertPublicProviderUrl } from "@/lib/network-security";
import { parseRequestJson } from "@/lib/request-json";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const { data, error } = await createAdminClient().from("providers").select("*").order("name");
  if (error) return adminErrorResponse(new GatewayError(503, "database_error", "Providers could not be loaded"));
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  try {
    const input = await parseRequestJson(request, providerSchema);
    const baseUrl = await assertPublicProviderUrl(input.base_url);
    const { data, error } = await createAdminClient()
      .from("providers")
      .insert({ ...input, base_url: baseUrl.toString() })
      .select("*")
      .single();
    if (error) throw new GatewayError(400, "provider_create_failed", error.code === "23505" ? "Provider slug already exists" : "Provider could not be created");
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
