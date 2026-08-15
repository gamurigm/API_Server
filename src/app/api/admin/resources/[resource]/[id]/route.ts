import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin-api";
import { enabledPatchSchema } from "@/lib/admin-schemas";
import { adminErrorResponse, GatewayError } from "@/lib/errors";
import { parseRequestJson } from "@/lib/request-json";
import { createAdminClient } from "@/lib/supabase/admin";

const resourceTables = {
  applications: "consumer_applications",
  "identity-providers": "identity_providers",
  providers: "providers",
  routes: "provider_routes",
  access: "application_provider_access",
  origins: "application_origins",
  credentials: "credentials",
} as const;

interface Context {
  params: Promise<{ resource: string; id: string }>;
}

export async function PATCH(request: Request, context: Context) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  try {
    const { resource, id } = await context.params;
    const table = resourceTables[resource as keyof typeof resourceTables];
    if (!table) throw new GatewayError(404, "resource_not_found", "Administrative resource is not supported");
    const input = await parseRequestJson(request, enabledPatchSchema);
    const { data, error } = await createAdminClient()
      .from(table)
      .update({ enabled: input.enabled })
      .eq("id", id)
      .select("id, enabled")
      .maybeSingle();
    if (error || !data) throw new GatewayError(404, "resource_not_found", "Resource could not be updated");
    return NextResponse.json({ data });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
