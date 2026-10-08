import inquirer from "inquirer";

import { loadArea, parseFieldValue, formInitialValue } from "@/admin-client/operations";
import type { AdminApiClient } from "@/admin-client/api-client";
import { ADMIN_AREA_BY_ID as areasById, type AdminArea, type AdminRow } from "@/admin-client/resources";

export interface CliStdinInput {
  password?: string;
  data?: unknown;
}

export async function readStdinInput(): Promise<CliStdinInput> {
  let input = "";
  for await (const chunk of process.stdin) input += String(chunk);
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error("stdin debe contener un objeto JSON válido");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("stdin debe contener un objeto JSON");
  }
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["password", "data"].includes(key))) {
    throw new Error("stdin solo admite los campos password y data");
  }
  if (typeof record.password !== "string" || record.password.length === 0) {
    throw new Error("stdin debe incluir password");
  }
  return { password: record.password, data: record.data };
}

export async function promptPassword(): Promise<string> {
  const { value } = await inquirer.prompt<{ value: string }>({
    type: "password", name: "value", message: "Contraseña administrativa", mask: "*",
    validate: (value) => value ? true : "Este campo es obligatorio",
  });
  return value;
}

export async function chooseRecord(area: AdminArea, rows: AdminRow[]): Promise<AdminRow> {
  if (!rows.length) throw new Error("No hay registros disponibles");
  const { id } = await inquirer.prompt<{ id: string }>({
    type: "list", name: "id", message: `Selecciona un registro de ${area.label}`,
    choices: rows.map((row) => ({ name: String(row.name ?? row.label ?? row.path_template ?? row.origin ?? row.id), value: row.id })),
  });
  return rows.find((row) => row.id === id)!;
}

export async function confirmAction(message: string): Promise<boolean> {
  const { yes } = await inquirer.prompt<{ yes: boolean }>({
    type: "confirm", name: "yes", message, default: false,
  });
  return yes;
}

export async function promptAreaData(
  client: AdminApiClient,
  area: AdminArea,
  mode: "create" | "edit",
  row?: AdminRow,
): Promise<Record<string, unknown>> {
  const fields = mode === "edit" ? area.editFields : area.fields;
  if (!fields?.length) throw new Error("Esta área no tiene campos editables");
  const data: Record<string, unknown> = {};
  for (const field of fields) {
    const rawDefault = formInitialValue(field, row);
    let question: Record<string, unknown>;
    if (field.kind === "boolean") {
      question = { type: "confirm", default: rawDefault === "true" || (!row && field.defaultValue === true) };
    } else if (field.kind === "choice") {
      const choices = field.relation
        ? (await loadArea(client, areasById[field.relation])).filter((item) => item.enabled !== false || item.id === row?.[field.key])
          .map((item) => ({ name: String(item.name ?? item.label ?? item.slug ?? item.id), value: item.id }))
        : (field.choices ?? []).map((value) => ({ name: value, value }));
      if (field.relation && !choices.length) {
        if (field.optional) continue;
        throw new Error(`No hay opciones para ${field.label}. Crea primero un registro relacionado.`);
      }
      question = { type: "list", choices, default: rawDefault || field.defaultValue };
    } else if (field.kind === "secret") {
      question = { type: "password", mask: "*", validate: (value: unknown) => parseFieldValue(field, String(value)) === undefined ? "Este campo es obligatorio" : true };
    } else if (field.kind === "multiline") {
      question = { type: "editor", default: rawDefault };
    } else {
      question = {
        type: "input", default: rawDefault,
        validate: (value: unknown) => {
          try {
            parseFieldValue(field, String(value));
            return true;
          } catch (error) {
            return error instanceof Error ? error.message : "Valor no válido";
          }
        },
      };
    }
    const { value } = await inquirer.prompt<{ value: unknown }>({
      ...question,
      name: "value",
      message: `${field.label}${field.optional ? " (opcional)" : ""}`,
    } as never);
    const parsed = field.kind === "boolean" ? Boolean(value) : parseFieldValue(field, String(value ?? ""));
    if (parsed !== undefined) data[field.key] = parsed;
  }
  if (area.id === "credentials" && data.owner_type === "shared") delete data.consumer_application_id;
  if (area.id === "credentials" && data.owner_type === "application" && !data.consumer_application_id) {
    throw new Error("Selecciona la aplicación propietaria de la credencial");
  }
  return data;
}

export function stdinData(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("stdin debe incluir data como objeto");
  return value as Record<string, unknown>;
}

export function rejectUnsafeInput(area: AdminArea, data: Record<string, unknown>): void {
  const fields = area.fields ?? [];
  const allowed = new Set(fields.map((field) => field.key));
  if (Object.keys(data).some((key) => !allowed.has(key))) {
    throw new Error("data contiene campos no admitidos para esta área");
  }
  if (Object.keys(data).some((key) => /password|token|hash|api.?key/iu.test(key))) {
    throw new Error("data contiene campos sensibles no permitidos");
  }
  if (Object.hasOwn(data, "secret") && area.id !== "credentials") {
    throw new Error("El secreto solo se admite al crear una credencial upstream");
  }
}
