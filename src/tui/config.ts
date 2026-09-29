import { isIP } from "node:net";

export interface TuiConfig {
  apiUrl: URL;
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized === "::1") {
    return true;
  }
  return isIP(normalized) === 4 && normalized.startsWith("127.");
}

export function isLoopbackUrl(value: URL): boolean {
  if (value.protocol !== "http:" && value.protocol !== "https:") {
    return false;
  }
  if (value.username || value.password || value.pathname !== "/" || value.search || value.hash) {
    return false;
  }

  return isLoopbackHost(value.hostname);
}

export function readTuiConfig(env: NodeJS.ProcessEnv): TuiConfig {
  const apiUrlValue = env.LOCAL_API_URL?.trim() || "http://127.0.0.1:43871";

  let apiUrl: URL;
  try {
    apiUrl = new URL(apiUrlValue);
  } catch {
    throw new Error("LOCAL_API_URL must be a valid loopback URL");
  }

  if (!isLoopbackUrl(apiUrl)) {
    throw new Error("LOCAL_API_URL must resolve to a loopback host (127.0.0.1, ::1, or localhost)");
  }

  return { apiUrl };
}
