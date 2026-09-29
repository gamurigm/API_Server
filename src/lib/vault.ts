import { getServerEnv } from "@/lib/env";
import { GatewayError } from "@/lib/errors";

const PATH_PATTERN = /^gateway\/credentials\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

function assertGatewayPath(path: string): void {
  if (!PATH_PATTERN.test(path)) throw new Error("Invalid gateway secret path");
}

async function vaultRequest(method: string, endpoint: string, body?: unknown): Promise<Response> {
  const env = getServerEnv();
  const url = new URL(`/v1/secret/${endpoint}`, env.VAULT_ADDR);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        "X-Vault-Token": env.VAULT_TOKEN,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
    if (response.status === 404 && method === "DELETE") return response;
    if (!response.ok) {
      throw new GatewayError(503, "credential_store_unavailable", "Vault is sealed, unavailable, or denied access", false);
    }
    return response;
  } catch {
    throw new GatewayError(503, "credential_store_unavailable", "Vault is sealed, unavailable, or denied access", false);
  }
}

export async function writeGatewaySecret(id: string, secret: string): Promise<string> {
  const path = `gateway/credentials/${id}`;
  assertGatewayPath(path);
  if (!secret) throw new Error("Secret value is required");
  await vaultRequest("POST", `data/${path}`, { options: { cas: 0 }, data: { secret } });
  return path;
}

export async function readGatewaySecret(path: string): Promise<string> {
  assertGatewayPath(path);
  const response = await vaultRequest("GET", `data/${path}`);
  const payload = await response.json().catch(() => null) as { data?: { data?: { secret?: unknown } } } | null;
  const secret = payload?.data?.data?.secret;
  if (typeof secret !== "string" || !secret) {
    throw new GatewayError(503, "credential_store_unavailable", "The provider credential could not be resolved", false);
  }
  return secret;
}

export async function deleteGatewaySecret(path: string): Promise<void> {
  assertGatewayPath(path);
  await vaultRequest("DELETE", `metadata/${path}`);
}
