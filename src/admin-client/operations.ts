import type { AdminApiClient } from "@/admin-client/api-client";
import type { AdminArea, AdminAreaId, AdminField, AdminRow } from "@/admin-client/resources";

interface DataEnvelope<T> {
  data: T;
}

export async function loadArea(client: AdminApiClient, area: AdminArea, limit = 100): Promise<AdminRow[]> {
  if (area.import) return [];
  const path = area.audit ? `${area.endpoint}?limit=${encodeURIComponent(String(limit))}` : area.endpoint;
  const response = await client.request<DataEnvelope<AdminRow[]>>(path);
  return response.data;
}

export function displayFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (Array.isArray(value)) return value.map(String).join(", ") || "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function formInitialValue(field: AdminField, record?: AdminRow): string {
  const value = record?.[field.key] ?? field.defaultValue;
  if (value === null || value === undefined) return "";
  if (field.kind === "csv" && Array.isArray(value)) return value.join(", ");
  if (field.kind === "json") return JSON.stringify(value, null, 2);
  return String(value);
}

export function parseFieldValue(field: AdminField, raw: string): unknown {
  const value = raw.trim();
  if (value === "") {
    if (field.nullable) return null;
    if (field.optional) return undefined;
    if (field.kind === "boolean") return false;
    if (field.kind === "csv") return [];
    if (field.kind === "json") return {};
    if (field.kind === "number" && field.defaultValue !== undefined) return field.defaultValue;
    throw new Error(`${field.label}: campo obligatorio`);
  }
  switch (field.kind) {
    case "number": {
      const numberValue = Number(value);
      if (!Number.isFinite(numberValue)) throw new Error(`${field.label}: debe ser un número`);
      return numberValue;
    }
    case "boolean":
      return value === "true" || value === "1" || value.toLowerCase() === "sí";
    case "choice":
    case "text":
    case "secret":
    case "multiline":
      return raw;
    case "csv":
      return value.split(",").map((part) => part.trim()).filter(Boolean);
    case "json": {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        throw new Error(`${field.label}: JSON no válido`);
      }
    }
  }
}

export function buildPayload(fields: readonly AdminField[], values: Record<string, string>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    const value = parseFieldValue(field, values[field.key] ?? "");
    if (value !== undefined) payload[field.key] = value;
  }
  return payload;
}

export async function createArea(client: AdminApiClient, area: AdminArea, payload: Record<string, unknown>) {
  const endpoint = area.import ? "/api/admin/openapi/import" : area.endpoint;
  return client.request<{ data?: unknown; key?: string }>(endpoint, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateArea(client: AdminApiClient, area: AdminArea, id: string, payload: Record<string, unknown>) {
  return client.request<{ data: AdminRow }>(`/api/admin/resources/${area.id}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function setAreaEnabled(client: AdminApiClient, area: AdminArea, row: AdminRow) {
  return updateArea(client, area, row.id, { enabled: row.enabled === false });
}

export async function deleteAreaRecord(client: AdminApiClient, area: AdminArea, id: string): Promise<void> {
  const endpoint = area.revoke
    ? `/api/admin/api-keys/${encodeURIComponent(id)}`
    : `/api/admin/resources/${area.id}/${encodeURIComponent(id)}`;
  await client.request<void>(endpoint, { method: "DELETE" });
}

export const areaPath = (areaId: AdminAreaId): string => `/api/admin/${areaId}`;
