import { describe, expect, it } from "vitest";

import { readRequestBody, readResponseBody } from "@/lib/body-limits";

describe("body limits", () => {
  it("accepts a JSON request below the limit", async () => {
    const request = new Request("https://gateway.test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true }),
    });
    const body = await readRequestBody(request, 100);
    expect(new TextDecoder().decode(body)).toBe('{"ok":true}');
  });

  it("rejects unsupported content types and oversized bodies", async () => {
    const text = new Request("https://gateway.test", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "hello" });
    await expect(readRequestBody(text, 100)).rejects.toMatchObject({ code: "unsupported_media_type" });
    const large = new Request("https://gateway.test", { method: "POST", headers: { "Content-Type": "application/json" }, body: "123456" });
    await expect(readRequestBody(large, 3)).rejects.toMatchObject({ code: "request_too_large" });
  });

  it("rejects oversized upstream responses", async () => {
    await expect(readResponseBody(new Response("123456"), 3)).rejects.toMatchObject({ code: "upstream_response_too_large" });
  });
});
