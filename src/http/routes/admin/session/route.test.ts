import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const adminSessionMocks = vi.hoisted(() => ({
  issue: vi.fn(() => ({ token: "session-token", expiresAt: "2030-01-01T00:00:00.000Z" })),
  verify: vi.fn<(_: string) => Promise<boolean>>(),
}));

vi.mock("@/lib/admin-session", () => ({
  issueAdminSession: adminSessionMocks.issue,
  verifyAdminPassword: adminSessionMocks.verify,
}));

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 60_000;
let postLogin: typeof import("@/http/routes/admin/session/route").POST;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-28T12:00:00.000Z"));
  vi.resetModules();
  vi.clearAllMocks();
  adminSessionMocks.verify.mockResolvedValue(false);
  ({ POST: postLogin } = await import("@/http/routes/admin/session/route"));
});

afterEach(() => {
  vi.useRealTimers();
});

async function login(): Promise<Response> {
  return postLogin(new Request("http://127.0.0.1/api/admin/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "incorrect-password" }),
  }));
}

describe("administrator login rate limit", () => {
  it("returns 429 with Retry-After before verifying a password past the attempt limit", async () => {
    for (let attempt = 0; attempt < MAX_LOGIN_ATTEMPTS; attempt += 1) {
      expect((await login()).status).toBe(401);
    }

    const limited = await login();

    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
    await expect(limited.json()).resolves.toMatchObject({
      error: { code: "admin_login_rate_limited" },
    });
    expect(adminSessionMocks.verify).toHaveBeenCalledTimes(MAX_LOGIN_ATTEMPTS);
  });

  it("allows verification again after the rolling window expires", async () => {
    for (let attempt = 0; attempt < MAX_LOGIN_ATTEMPTS; attempt += 1) await login();

    vi.advanceTimersByTime(LOGIN_WINDOW_MS);
    const response = await login();

    expect(response.status).toBe(401);
    expect(adminSessionMocks.verify).toHaveBeenCalledTimes(MAX_LOGIN_ATTEMPTS + 1);
  });

  it("clears the limit after a successful login", async () => {
    for (let attempt = 0; attempt < MAX_LOGIN_ATTEMPTS - 1; attempt += 1) await login();
    adminSessionMocks.verify.mockResolvedValueOnce(true);

    expect((await login()).status).toBe(200);
    expect((await login()).status).toBe(401);
    expect(adminSessionMocks.verify).toHaveBeenCalledTimes(MAX_LOGIN_ATTEMPTS + 1);
  });
});
