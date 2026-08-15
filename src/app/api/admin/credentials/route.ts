import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin-api";
import { credentialSchema } from "@/lib/admin-schemas";
import { adminErrorResponse, GatewayError } from "@/lib/errors";
import { parseRequestJson } from "@/lib/request-json";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const { data, error } = await createAdminClient()
    .from("credentials")
    .select("id, provider_id, owner_type, consumer_application_id, label, enabled, created_at, updated_at, providers(name, slug), consumer_applications(name, slug)")
    .order("created_at", { ascending: false });
  if (error) return adminErrorResponse(new GatewayError(503, "database_error", "Credential metadata could not be loaded"));
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  try {
    const input = await parseRequestJson(request, credentialSchema);
    if (input.owner_type === "shared" && input.consumer_application_id) {
      throw new GatewayError(400, "invalid_credential_owner", "Shared credentials cannot belong to an application");
    }
    if (input.owner_type === "application" && !input.consumer_application_id) {
      throw new GatewayError(400, "invalid_credential_owner", "Application credentials require an application");
    }

    const { data, error } = await createAdminClient().rpc("create_gateway_credential", {
      p_provider_id: input.provider_id,
      p_owner_type: input.owner_type,
      p_consumer_application_id: input.consumer_application_id ?? null,
      p_label: input.label,
      p_secret: input.secret,
    });
    if (error || typeof data !== "string") {
      throw new GatewayError(400, "credential_create_failed", "Credential could not be stored");
    }
    return NextResponse.json({ data: { id: data } }, { status: 201 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
