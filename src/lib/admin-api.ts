import { getAdminContext } from "@/lib/admin-auth";

export async function requireAdminApi(request: Request): Promise<Response | null> {
  const context = await getAdminContext(request);
  if (!context) {
    return Response.json(
      { error: { code: "admin_unauthorized", message: "Administrator access required" } },
      { status: 401 },
    );
  }
  return null;
}
