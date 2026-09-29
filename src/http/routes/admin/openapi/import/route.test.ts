import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  assertAdminKeyMutation: vi.fn(),
  importOpenApiRoutes: vi.fn(),
}));

vi.mock("@/lib/admin-api", () => ({ requireAdminApi: mocks.requireAdminApi }));
vi.mock("@/lib/admin-key-request", () => ({ assertAdminKeyMutation: mocks.assertAdminKeyMutation }));
vi.mock("@/lib/db/openapi-import", () => ({ importOpenApiRoutes: mocks.importOpenApiRoutes }));

import { POST } from "@/http/routes/admin/openapi/import/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdminApi.mockResolvedValue(null);
  mocks.importOpenApiRoutes.mockResolvedValue(1);
});

function request(): Request {
  return new Request("http://127.0.0.1/api/admin/openapi/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider_id: "9ec6de8f-b350-414f-bf94-a64f1b8c44b9",
      document: { openapi: "3.0.3", paths: { "/hello": { get: {} } } },
    }),
  });
}

describe("OpenAPI import database errors", () => {
  it("returns 503 when PostgreSQL is unavailable", async () => {
    const databaseError = Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" });
    mocks.importOpenApiRoutes.mockRejectedValue(databaseError);

    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "database_error" } });
  });

  it("keeps invalid provider or database constraint failures as import errors", async () => {
    const constraintError = Object.assign(new Error("provider missing"), { code: "23503" });
    mocks.importOpenApiRoutes.mockRejectedValue(constraintError);

    const response = await POST(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "openapi_import_failed" } });
  });
});
