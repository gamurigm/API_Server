import { GatewayError } from "@/lib/errors";

export function assertAdminKeyMutation(request: Request): void {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" ||
    (origin && origin !== new URL(request.url).origin)) {
    throw new GatewayError(403, "origin_not_allowed", "Cross-origin key management is not allowed");
  }
  // Required even for DELETE, so browser forms cannot revoke keys cross-origin.
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new GatewayError(415, "unsupported_media_type", "Content-Type must be application/json");
  }
}
