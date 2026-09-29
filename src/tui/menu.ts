import inquirer from "inquirer";

import type { AdminApiClient } from "@/tui/api-client";
import type { TuiSession } from "@/tui/auth";
import { run as runApiKeys } from "@/tui/screens/api-keys";
import { run as runApplications } from "@/tui/screens/applications";
import { run as runAccess } from "@/tui/screens/access";
import { run as runAudit } from "@/tui/screens/audit";
import { run as runCredentials } from "@/tui/screens/credentials";
import { run as runIdentityProviders } from "@/tui/screens/identity-providers";
import { run as runOpenApi } from "@/tui/screens/openapi";
import { run as runOrigins } from "@/tui/screens/origins";
import { run as runProviders } from "@/tui/screens/providers";
import { run as runRoutes } from "@/tui/screens/routes";

export interface AdminRecord extends Record<string, unknown> {
  id: string;
  enabled?: boolean;
}

export async function choose<T>(message: string, choices: Array<{ name: string; value: T }>): Promise<T> {
  const { value } = await inquirer.prompt<{ value: T }>({
    type: "list",
    name: "value",
    message,
    choices,
  });
  return value;
}

export async function ask(message: string, defaultValue?: string): Promise<string> {
  const { value } = await inquirer.prompt<{ value: string }>({
    type: "input",
    name: "value",
    message,
    ...(defaultValue === undefined ? {} : { default: defaultValue }),
    validate: (value: string) => (value.trim() ? true : "Este campo es obligatorio"),
  });
  return value.trim();
}

export async function askOptional(message: string, defaultValue = ""): Promise<string> {
  const { value } = await inquirer.prompt<{ value: string }>({
    type: "input",
    name: "value",
    message,
    default: defaultValue,
  });
  return value.trim();
}

export async function askSecret(message: string): Promise<string> {
  const { value } = await inquirer.prompt<{ value: string }>({
    type: "password",
    name: "value",
    message,
    mask: "*",
    validate: (value: string) => (value ? true : "Este campo es obligatorio"),
  });
  return value;
}

export async function askConfirm(message: string, defaultValue = false): Promise<boolean> {
  const { value } = await inquirer.prompt<{ value: boolean }>({
    type: "confirm",
    name: "value",
    message,
    default: defaultValue,
  });
  return value;
}

export async function askNumber(message: string, defaultValue?: number, optional = false): Promise<number | null> {
  const value = await askOptional(message, defaultValue === undefined ? "" : String(defaultValue));
  if (!value && optional) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`${message}: ingresa un entero mayor que cero`);
  }
  return number;
}

export async function loadRecords(client: AdminApiClient, endpoint: string): Promise<AdminRecord[]> {
  const response = await client.request<{ data: AdminRecord[] }>(endpoint);
  return response.data;
}

export function showRecords(title: string, records: AdminRecord[], columns: string[]): void {
  console.log(`\n${title} (${records.length})`);
  if (records.length === 0) {
    console.log("  Sin registros.");
    return;
  }
  console.table(records.map((record) => Object.fromEntries(columns.map((column) => [column, record[column] ?? "—"]))));
}

export async function handleScreenError(error: unknown): Promise<void> {
  if (isPromptCancelled(error)) throw error;
  console.error(`\nNo se pudo completar la operación: ${error instanceof Error ? error.message : "error inesperado"}`);
}

function isPromptCancelled(error: unknown): boolean {
  return error instanceof Error && ["ExitPromptError", "AbortPromptError"].includes(error.name);
}

export async function runMainMenu(session: TuiSession): Promise<boolean> {
  const action = await choose("Administración del gateway", [
    { name: "Claves de acceso de aplicaciones", value: "api-keys" },
    { name: "Aplicaciones consumidoras", value: "applications" },
    { name: "Emisores JWT / JWKS", value: "identity-providers" },
    { name: "Proveedores upstream", value: "providers" },
    { name: "Rutas permitidas", value: "routes" },
    { name: "Accesos aplicación → proveedor", value: "access" },
    { name: "Orígenes CORS", value: "origins" },
    { name: "Credenciales upstream en Vault", value: "credentials" },
    { name: "Importar contrato OpenAPI", value: "openapi" },
    { name: "Auditoría de invocaciones", value: "audit" },
    { name: "Cerrar sesión y salir", value: "exit" },
  ]);

  const screens: Record<string, (client: AdminApiClient) => Promise<void>> = {
    "api-keys": runApiKeys,
    applications: runApplications,
    "identity-providers": runIdentityProviders,
    providers: runProviders,
    routes: runRoutes,
    access: runAccess,
    origins: runOrigins,
    credentials: runCredentials,
    openapi: runOpenApi,
    audit: runAudit,
  };
  if (action === "exit") return false;
  await screens[action](session.api);
  return true;
}
