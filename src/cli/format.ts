import { displayFieldValue } from "@/admin-client/operations";
import type { AdminArea, AdminRow } from "@/admin-client/resources";

export function printRows(area: AdminArea, rows: AdminRow[], json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify({ area: area.id, data: rows }, null, 2)}\n`);
    return;
  }
  console.table(rows.map((row) => Object.fromEntries(area.columns.map((column) => [column, displayFieldValue(row[column])]))));
}

export function printResult(area: AdminArea, action: string, result: unknown, json: boolean): void {
  const envelope = typeof result === "object" && result !== null ? result as Record<string, unknown> : {};
  const data = envelope.data ?? result;
  const key = typeof envelope.key === "string" ? envelope.key : undefined;
  if (json) {
    process.stdout.write(`${JSON.stringify({ area: area.id, action, data, ...(key ? { key } : {}) }, null, 2)}\n`);
    return;
  }
  if (Array.isArray(data)) printRows(area, data as AdminRow[], false);
  else if (typeof data === "object" && data !== null) console.table(data);
  if (key) console.log(`\nClave completa (solo se muestra ahora):\n${key}`);
  else if (data === undefined) console.log("Operación completada.");
  else if (area.import && typeof data === "object" && data !== null && "imported" in data) {
    console.log(`Importación completada: ${String((data as { imported: unknown }).imported)} rutas.`);
  } else if (!Array.isArray(data) && (typeof data !== "object" || data === null)) console.log(displayFieldValue(data));
}

export function printDeleted(area: AdminArea, action: string, id: string, json: boolean): void {
  if (json) process.stdout.write(`${JSON.stringify({ area: area.id, action, id, deleted: true })}\n`);
  else console.log(action === "revoke" ? "Clave revocada permanentemente." : "Registro eliminado.");
}
