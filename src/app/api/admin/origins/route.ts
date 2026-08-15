import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin-api";
import { applicationOriginSchema } from "@/lib/admin-schemas";
import { adminErrorResponse, GatewayError } from "@/lib/errors";
import { parseRequestJson } from "@/lib/request-json";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function normalizeOrigin(value: string): string {
  const url = new URL(value);
  const isLocalDevelopment =
    url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !isLocalDevelopment) {
    throw new GatewayError(400, "invalid_origin", "Browser origins must use HTTPS, except localhost development");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new GatewayError(400, "invalid_origin", "Origin must contain only scheme, host and optional port");
  }
  return url.origin;
}

export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const { data, error } = await createAdminClient()
    .from("application_origins")
    .select("*, consumer_applications(name, slug)")
    .order("origin");
  if (error) return adminErrorResponse(new GatewayError(503, "database_error", "Browser origins could not be loaded"));
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  try {
    const input = await parseRequestJson(request, applicationOriginSchema);
    const { data, error } = await createAdminClient()
      .from("application_origins")
      .upsert(
        { ...input, origin: normalizeOrigin(input.origin) },
        { onConflict: "consumer_application_id,origin" },
      )
      .select("*")
      .single();
    if (error) throw new GatewayError(400, "origin_create_failed", "Browser origin could not be saved");
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
