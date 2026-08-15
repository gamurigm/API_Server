import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = performance.now();
  try {
    const { error } = await createAdminClient().from("providers").select("id", { head: true, count: "exact" });
    if (error) throw error;
    return NextResponse.json({
      status: "ok",
      database: "ok",
      durationMs: Math.round(performance.now() - startedAt),
    });
  } catch {
    return NextResponse.json(
      { status: "degraded", database: "unavailable" },
      { status: 503 },
    );
  }
}
