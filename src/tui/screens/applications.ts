import type { AdminApiClient } from "@/tui/api-client";
import { ask, askNumber, askOptional, choose, handleScreenError, loadRecords, showRecords } from "@/tui/menu";

export async function run(client: AdminApiClient): Promise<void> {
  try {
    const records = await loadRecords(client, "/api/admin/applications");
    const action = await choose("Aplicaciones consumidoras", [
      { name: "Listar aplicaciones", value: "list" },
      { name: "Crear aplicación", value: "create" },
      { name: "Activar / desactivar", value: "toggle" },
      { name: "Volver", value: "back" },
    ]);
    if (action === "back") return;
    if (action === "list") {
      showRecords("Aplicaciones", records, ["name", "slug", "rate_limit_per_minute", "enabled"]);
      return;
    }
    if (action === "toggle") {
      if (!records.length) return console.log("No hay aplicaciones para cambiar.");
      const id = await choose("Selecciona una aplicación", records.map((record) => ({ name: `${record.name} (${record.enabled === false ? "inactiva" : "activa"})`, value: record.id })));
      const record = records.find((item) => item.id === id)!;
      await client.request(`/api/admin/resources/applications/${encodeURIComponent(id)}`, {
        method: "PATCH", body: JSON.stringify({ enabled: record.enabled === false }),
      });
      console.log("Estado actualizado.");
      return;
    }
    const name = await ask("Nombre");
    const slug = await ask("Slug (minúsculas, números y guiones)");
    const description = await askOptional("Descripción (opcional)");
    const rate = await askNumber("Límite por minuto", 60);
    await client.request("/api/admin/applications", {
      method: "POST",
      body: JSON.stringify({ name, slug, description: description || null, rate_limit_per_minute: rate, enabled: true }),
    });
    console.log("Aplicación creada.");
  } catch (error) {
    await handleScreenError(error);
  }
}
