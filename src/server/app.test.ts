import { describe, expect, it, vi } from "vitest";

import { createHttpApp } from "@/server/app";

describe("Hono HTTP route smoke coverage", () => {
  it("returns service information at the root and passes health through", async () => {
    const health = vi.fn(async () => Response.json({ status: "ok", database: "ok" }));
    const app = createHttpApp({ health });

    const root = await app.request("/");
    expect(root.status).toBe(200);
    await expect(root.json()).resolves.toMatchObject({
      service: "federated-api-gateway",
      health: "/api/health",
    });

    const response = await app.request("/api/health");
    expect(health).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok", database: "ok" });
  });

  it("keeps the provider catalog endpoint mounted and passes the original request", async () => {
    const providers = vi.fn(async (request: Request) => Response.json({
      method: request.method,
      url: request.url,
    }));
    const app = createHttpApp({ providers });

    const response = await app.request("/api/v1/providers?mode=smoke");
    expect(providers).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toMatchObject({
      method: "GET",
      url: expect.stringContaining("/api/v1/providers?mode=smoke"),
    });
  });

  it("passes gateway requests through without buffering streaming responses", async () => {
    const gateway = vi.fn(async (request: Request) => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`data: ${request.method.toLowerCase()}\n\n`));
        controller.close();
      },
    }), { headers: { "Content-Type": "text/event-stream" } }));
    const app = createHttpApp({ gateway });

    const response = await app.request("/api/v1/gateway/market-data/v1/quotes?symbol=ABC", {
      method: "POST",
      body: "{\"request\":true}",
      headers: { "Content-Type": "application/json" },
    });
    expect(gateway).toHaveBeenCalledOnce();
    expect(gateway.mock.calls[0]?.[0]?.method).toBe("POST");
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    await expect(response.text()).resolves.toBe("data: post\n\n");
  });
});
