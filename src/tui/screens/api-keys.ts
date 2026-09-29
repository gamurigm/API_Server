import type { AdminApiClient } from "@/tui/api-client";
import { ask, askOptional, askConfirm, choose, handleScreenError, loadRecords, showRecords } from "@/tui/menu";

export async function run(client: AdminApiClient): Promise<void> {
  try {
    const [records, applications] = await Promise.all([
      loadRecords(client, "/api/admin/api-keys"),
      loadRecords(client, "/api/admin/applications"),
    ]);
    const action = await choose("Claves de acceso", [
      { name: "Listar metadatos", value: "list" },
      { name: "Crear clave (se muestra una sola vez)", value: "create" },
      { name: "Revocar clave", value: "revoke" },
      { name: "Volver", value: "back" },
    ]);
    if (action === "back") return;
    if (action === "list") {
      showRecords("Claves (no se muestra la clave completa)", records, ["label", "key_prefix", "consumer_application_id", "scopes", "expires_at", "revoked_at", "created_at"]);
      return;
    }
    if (action === "revoke") {
      const revocable = records.filter((record) => !record.revoked_at);
      if (!revocable.length) return console.log("No hay claves activas para revocar.");
      const id = await choose("Selecciona la clave", revocable.map((record) => ({ name: `${record.label} · ${record.key_prefix}…`, value: record.id })));
      const selected = revocable.find((record) => record.id === id)!;
      if (!(await askConfirm(`Revocar permanentemente la clave “${selected.label}”?`))) return;
      await client.request(`/api/admin/api-keys/${encodeURIComponent(id)}`, { method: "DELETE" });
      console.log("Clave revocada. La acción es permanente.");
      return;
    }

    const apps = applications.filter((item) => item.enabled !== false);
    if (!apps.length) return console.log("Primero crea y activa una aplicación.");
    const consumer_application_id = await choose("Aplicación", apps.map((app) => ({ name: String(app.name), value: app.id })));
    const label = await ask("Nombre descriptivo de la clave");
    const scopes = (await askOptional("Scopes permitidos separados por coma")).split(",").map((value) => value.trim()).filter(Boolean);
    const localExpiry = await askOptional("Vencimiento local (YYYY-MM-DD HH:mm), vacío = sin vencimiento");
    let expires_at: string | null = null;
    if (localExpiry) {
      const parsed = new Date(localExpiry.replace(" ", "T"));
      if (Number.isNaN(parsed.getTime())) throw new Error("La fecha de vencimiento no es válida");
      expires_at = parsed.toISOString();
    }
    const created = await client.request<{ data: { id: string }; key: string }>("/api/admin/api-keys", {
      method: "POST", body: JSON.stringify({ consumer_application_id, label, scopes, expires_at }),
    });
    process.stdout.write("\nCopia esta clave ahora: se muestra una sola vez. Guárdala en las variables de entorno de tu aplicación.\n");
    process.stdout.write(`${created.key}\n\n`);
    created.key = "";
    process.stdout.write("Si la pierdes, revócala y crea otra; no se puede recuperar. Presiona Enter para volver.\n");
    await askOptional("", "");
  } catch (error) {
    await handleScreenError(error);
  }
}
