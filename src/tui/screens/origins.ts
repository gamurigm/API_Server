import type { AdminApiClient } from "@/tui/api-client";
import { ask, choose, handleScreenError, loadRecords, showRecords } from "@/tui/menu";

export async function run(client: AdminApiClient): Promise<void> {
  try {
    const [records, applications] = await Promise.all([
      loadRecords(client, "/api/admin/origins"),
      loadRecords(client, "/api/admin/applications"),
    ]);
    const action = await choose("Orígenes CORS", [
      { name: "Listar orígenes", value: "list" },
      { name: "Permitir origen", value: "create" },
      { name: "Activar / desactivar", value: "toggle" },
      { name: "Volver", value: "back" },
    ]);
    if (action === "back") return;
    if (action === "list") {
      showRecords("Orígenes permitidos", records, ["consumer_application_id", "origin", "enabled"]);
      return;
    }
    if (action === "toggle") {
      if (!records.length) return console.log("No hay orígenes para cambiar.");
      const id = await choose("Selecciona un origen", records.map((record) => ({ name: `${record.origin} (${record.enabled === false ? "inactivo" : "activo"})`, value: record.id })));
      const record = records.find((item) => item.id === id)!;
      await client.request(`/api/admin/resources/origins/${encodeURIComponent(id)}`, {
        method: "PATCH", body: JSON.stringify({ enabled: record.enabled === false }),
      });
      console.log("Estado actualizado.");
      return;
    }
    const apps = applications.filter((item) => item.enabled !== false);
    if (!apps.length) return console.log("Primero crea y activa una aplicación.");
    const consumer_application_id = await choose("Aplicación", apps.map((app) => ({ name: String(app.name), value: app.id })));
    const origin = await ask("Origen exacto (protocolo + host + puerto, sin path)");
    await client.request("/api/admin/origins", {
      method: "POST", body: JSON.stringify({ consumer_application_id, origin, enabled: true }),
    });
    console.log("Origen permitido.");
  } catch (error) {
    await handleScreenError(error);
  }
}
