import { isAdminSession } from "@/lib/admin-session";

export interface AdminContext {
  authorized: true;
}

export function getAdminBearer(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  return authorization && /^Bearer[ \t]+([A-Za-z0-9_-]{43})$/iu.exec(authorization)?.[1] || null;
}

export function getAdminContext(request: Request): AdminContext | null {
  const bearer = getAdminBearer(request);
  return bearer && isAdminSession(bearer) ? { authorized: true } : null;
}
