import "server-only";

import { NextResponse } from "next/server";

import { getAdminContext } from "@/lib/admin-auth";

export async function requireAdminApi(): Promise<NextResponse | null> {
  const context = await getAdminContext();
  if (!context) {
    return NextResponse.json(
      { error: { code: "admin_unauthorized", message: "Administrator access required" } },
      { status: 401 },
    );
  }
  return null;
}
