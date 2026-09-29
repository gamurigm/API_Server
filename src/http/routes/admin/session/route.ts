import { z } from "zod";

import { getAdminBearer } from "@/lib/admin-auth";
import { checkAdminLoginRateLimit, resetAdminLoginRateLimit } from "@/lib/admin-login-rate-limit";
import { requireAdminApi } from "@/lib/admin-api";
import { assertAdminKeyMutation } from "@/lib/admin-key-request";
import { issueAdminSession, revokeAdminSession, verifyAdminPassword } from "@/lib/admin-session";
import { adminErrorResponse } from "@/lib/errors";
import { parseRequestJson } from "@/lib/request-json";

const headers = { "Cache-Control": "no-store" };
const loginSchema = z.object({ password: z.string().min(1).max(1_024) });

export async function POST(request: Request) {
  try {
    assertAdminKeyMutation(request);
    const { password } = await parseRequestJson(request, loginSchema);
    const retryAfter = checkAdminLoginRateLimit();
    if (retryAfter !== null) {
      return Response.json(
        { error: { code: "admin_login_rate_limited", message: "Too many login attempts; try again later" } },
        { status: 429, headers: { ...headers, "Retry-After": String(retryAfter) } },
      );
    }
    if (!await verifyAdminPassword(password)) {
      return Response.json(
        { error: { code: "admin_unauthorized", message: "Invalid administrator password" } },
        { status: 401, headers },
      );
    }
    resetAdminLoginRateLimit();
    return Response.json({ data: issueAdminSession() }, { headers });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;
  const bearer = getAdminBearer(request);
  if (bearer) revokeAdminSession(bearer);
  return new Response(null, { status: 204, headers });
}
