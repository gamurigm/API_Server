import { isLoopbackUrl } from "@/tui/config";

interface ErrorEnvelope {
  error?: {
    code?: unknown;
    message?: unknown;
  };
}

export class AdminApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.code = code;
  }
}

export class AdminApiClient {
  constructor(
    private readonly baseUrl: URL,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!isLoopbackUrl(baseUrl)) {
      throw new Error("Admin API URL must resolve to a loopback host");
    }
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!path.startsWith("/api/admin/") || path.startsWith("//")) {
      throw new Error("Admin API requests must use a path under /api/admin/");
    }

    const url = new URL(path, this.baseUrl);
    if (url.origin !== this.baseUrl.origin || !url.pathname.startsWith("/api/admin/")) {
      throw new Error("Admin API requests must stay on the configured local backend");
    }

    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${this.token}`);
    if (!(typeof FormData !== "undefined" && init.body instanceof FormData)) {
      headers.set("content-type", "application/json");
    }
    headers.set("accept", "application/json");

    const response = await this.fetchImpl(url, { ...init, headers, redirect: "error" });
    if (response.ok) {
      if (response.status === 204) {
        return undefined as T;
      }
      return (await response.json()) as T;
    }

    const envelope = (await response.json().catch(() => null)) as ErrorEnvelope | null;
    const message =
      typeof envelope?.error?.message === "string"
        ? envelope.error.message
        : `Admin API request failed with HTTP ${response.status}`;
    const code = typeof envelope?.error?.code === "string" ? envelope.error.code : undefined;
    throw new AdminApiError(message, response.status, code);
  }
}
