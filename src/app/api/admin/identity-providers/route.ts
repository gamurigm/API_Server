import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin-api";
import { identityProviderSchema } from "@/lib/admin-schemas";
import { adminErrorResponse, GatewayError } from "@/lib/errors";
import { assertPublicProviderUrl } from "@/lib/network-security";
import { parseRequestJson } from "@/lib/request-json";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const { data, error } = await createAdminClient()
    .from("identity_providers")
    .select("*, consumer_applications(name, slug)")
    .order("name");
  if (error) return adminErrorResponse(new GatewayError(503, "database_error", "Identity providers could not be loaded"));
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  try {
    const input = await parseRequestJson(request, identityProviderSchema);
    await Promise.all([
      assertPublicProviderUrl(input.issuer),
      assertPublicProviderUrl(input.jwks_uri),
    ]);
    const { data, error } = await createAdminClient()
      .from("identity_providers")
      .insert(input)
      .select("*")
      .single();
    if (error) throw new GatewayError(400, "identity_provider_create_failed", error.code === "23505" ? "This issuer is already registered for the application" : "Identity provider could not be created");
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
