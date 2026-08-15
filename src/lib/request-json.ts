import { z } from "zod";

import { GatewayError } from "@/lib/errors";

export async function parseRequestJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new GatewayError(400, "invalid_json", "Request body must be valid JSON");
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
      .join("; ");
    throw new GatewayError(400, "validation_failed", detail);
  }
  return parsed.data;
}
