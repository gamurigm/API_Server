import { NextResponse } from "next/server";

import type { GatewayErrorBody } from "@/types/gateway";

export class GatewayError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly expose = true,
    public readonly headers: HeadersInit = {},
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

export function gatewayErrorResponse(
  error: unknown,
  requestId: string,
  extraHeaders?: HeadersInit,
): NextResponse<GatewayErrorBody> {
  const known = error instanceof GatewayError;
  const status = known ? error.status : 500;
  const code = known ? error.code : "internal_error";
  const message = known && error.expose ? error.message : "Unexpected gateway error";
  const headers = new Headers(known ? error.headers : undefined);
  for (const [name, value] of new Headers(extraHeaders).entries()) {
    headers.set(name, value);
  }
  headers.set("Cache-Control", "no-store");
  headers.set("X-Gateway-Request-Id", requestId);

  return NextResponse.json(
    { error: { code, message, requestId } },
    {
      status,
      headers,
    },
  );
}

export function adminErrorResponse(error: unknown): NextResponse {
  if (error instanceof GatewayError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  return NextResponse.json(
    { error: { code: "internal_error", message: "Unexpected server error" } },
    { status: 500 },
  );
}
