import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { GatewayError } from "@/lib/errors";

const dnsCache = new Map<string, { expiresAt: number; addresses: string[] }>();
const DNS_CACHE_MS = 60_000;

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/u, "");
  return normalized === "localhost" || normalized.endsWith(".localhost") ||
    normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}

function localTestHostsEnabled(): boolean {
  return process.env.NODE_ENV !== "production" &&
    process.env.GATEWAY_ALLOW_LOCAL_TEST_HOSTS === "true";
}

export function isPrivateOrReservedIp(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];
  const version = isIP(normalized);
  if (version === 4) {
    const parts = normalized.split(".").map(Number);
    const [a, b, c] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }

  if (version === 6) {
    if (normalized.startsWith("::ffff:")) {
      return isPrivateOrReservedIp(normalized.slice(7));
    }
    const first = Number.parseInt(normalized.split(":")[0] || "0", 16);
    return (
      normalized === "::" ||
      normalized === "::1" ||
      (first & 0xfe00) === 0xfc00 ||
      (first & 0xffc0) === 0xfe80 ||
      (first & 0xff00) === 0xff00 ||
      normalized.startsWith("2001:db8:")
    );
  }

  return true;
}

export function validateProviderBaseUrlSyntax(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new GatewayError(400, "invalid_provider_url", "Provider base URL is invalid");
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new GatewayError(400, "invalid_provider_url", "Provider base URL cannot include credentials, query or fragment");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/u, "");
  if (localTestHostsEnabled() && isLoopbackHostname(hostname)) {
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new GatewayError(400, "invalid_provider_url", "Local test URLs must use HTTP or HTTPS");
    }
    return url;
  }

  if (url.protocol !== "https:") {
    throw new GatewayError(400, "invalid_provider_url", "Provider base URL must use HTTPS");
  }
  if (url.port && url.port !== "443") {
    throw new GatewayError(400, "invalid_provider_url", "Only the standard HTTPS port is allowed");
  }

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    isIP(hostname)
  ) {
    throw new GatewayError(400, "blocked_provider_host", "Provider host is not public");
  }

  return url;
}

export async function assertPublicProviderUrl(value: string): Promise<URL> {
  const url = validateProviderBaseUrlSyntax(value);
  const hostname = url.hostname.toLowerCase();
  if (localTestHostsEnabled() && isLoopbackHostname(hostname)) {
    return url;
  }
  const cached = dnsCache.get(hostname);
  let addresses: string[];

  if (cached && cached.expiresAt > Date.now()) {
    addresses = cached.addresses;
  } else {
    try {
      const resolved = await lookup(hostname, { all: true, verbatim: true });
      addresses = resolved.map((entry) => entry.address);
    } catch {
      throw new GatewayError(502, "provider_dns_failed", "Provider host could not be resolved");
    }
    dnsCache.set(hostname, { addresses, expiresAt: Date.now() + DNS_CACHE_MS });
  }

  if (addresses.length === 0 || addresses.some(isPrivateOrReservedIp)) {
    throw new GatewayError(403, "blocked_provider_host", "Provider host resolves to a non-public address");
  }
  return url;
}
