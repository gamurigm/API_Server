import { GatewayError } from "@/lib/errors";

export async function readRequestBody(request: Request, limit: number): Promise<Uint8Array | undefined> {
  if (["GET", "HEAD"].includes(request.method)) {
    return undefined;
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    throw new GatewayError(413, "request_too_large", "Request body exceeds the gateway limit");
  }

  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType && contentType !== "application/json" && !contentType.endsWith("+json")) {
    throw new GatewayError(415, "unsupported_media_type", "Version 1 accepts JSON request bodies only");
  }

  if (!request.body) {
    return undefined;
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel("request body limit exceeded");
      throw new GatewayError(413, "request_too_large", "Request body exceeds the gateway limit");
    }
    chunks.push(value);
  }

  if (total === 0) {
    return undefined;
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function readResponseBody(response: Response, limit: number): Promise<Uint8Array> {
  if (!response.body) {
    return new Uint8Array();
  }

  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    await response.body.cancel("response body limit exceeded");
    throw new GatewayError(502, "upstream_response_too_large", "Upstream response exceeds the gateway limit");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel("response body limit exceeded");
      throw new GatewayError(502, "upstream_response_too_large", "Upstream response exceeds the gateway limit");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
