import inquirer from "inquirer";

import { AdminApiClient, AdminApiError } from "@/tui/api-client";
import type { TuiConfig } from "@/tui/config";

export interface TuiSession {
  expiresAt: string;
  api: AdminApiClient;
}

export async function promptForPassword(): Promise<string> {
  const { password } = await inquirer.prompt<{ password: string }>([{
    type: "password",
    name: "password",
    message: "Contraseña local de administración",
    mask: "*",
    validate: (value: string) => value.length > 0 || "La contraseña es obligatoria",
  }]);
  return password;
}

export async function signIn(password: string, config: TuiConfig): Promise<TuiSession> {
  const url = new URL("/api/admin/session", config.apiUrl);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ password }),
    redirect: "error",
  });
  const payload = await response.json().catch(() => null) as {
    data?: { token?: unknown; expiresAt?: unknown };
    error?: { code?: unknown; message?: unknown };
  } | null;
  if (!response.ok) {
    const message = typeof payload?.error?.message === "string" ? payload.error.message : "No se pudo iniciar sesión";
    const code = typeof payload?.error?.code === "string" ? payload.error.code : undefined;
    throw new AdminApiError(message, response.status, code);
  }
  if (typeof payload?.data?.token !== "string" || typeof payload.data.expiresAt !== "string") {
    throw new Error("El backend devolvió una sesión inválida");
  }
  return { expiresAt: payload.data.expiresAt, api: new AdminApiClient(config.apiUrl, payload.data.token) };
}

export async function signOut(session: TuiSession): Promise<void> {
  await session.api.request("/api/admin/session", { method: "DELETE" });
}
