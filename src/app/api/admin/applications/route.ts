import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin-api";
import { consumerApplicationSchema } from "@/lib/admin-schemas";
import { adminErrorResponse, GatewayError } from "@/lib/errors";
import { parseRequestJson } from "@/lib/request-json";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const { data, error } = await createAdminClient()
    .from("consumer_applications")
    .select("*")
    .order("name");
  if (error) return adminErrorResponse(new GatewayError(503, "database_error", "Applications could not be loaded"));
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  try {
    const input = await parseRequestJson(request, consumerApplicationSchema);
    const { data, error } = await createAdminClient()
      .from("consumer_applications")
      .insert(input)
      .select("*")
      .single();
    if (error) throw new GatewayError(400, "application_create_failed", error.code === "23505" ? "Application slug already exists" : "Application could not be created");
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
