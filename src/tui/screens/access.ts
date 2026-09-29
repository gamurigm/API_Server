import type { AdminApiClient } from "@/tui/api-client";
import { askNumber, choose, handleScreenError, loadRecords, showRecords } from "@/tui/menu";

export async function run(client: AdminApiClient): Promise<void> {
  try {
    const [records, applications, providers] = await Promise.all([
      loadRecords(client, "/api/admin/access"),
      loadRecords(client, "/api/admin/applications"),
      loadRecords(client, "/api/admin/providers"),
    ]);
    const action = await choose("Accesos aplicación → proveedor", [
      { name: "Listar reglas", value: "list" },
      { name: "Autorizar o actualizar regla", value: "create" },
      { name: "Activar / desactivar", value: "toggle" },
      { name: "Volver", value: "back" },
    ]);
    if (action === "back") return;
    if (action === "list") {
      showRecords("Reglas de acceso", records, ["consumer_application_id", "provider_id", "rate_limit_per_minute", "enabled"]);
      return;
    }
    if (action === "toggle") {
      if (!records.length) return console.log("No hay reglas para cambiar.");
      const id = await choose("Selecciona una regla", records.map((record) => ({ name: `${record.consumer_application_id} → ${record.provider_id} (${record.enabled === false ? "inactiva" : "activa"})`, value: record.id })));
      const record = records.find((item) => item.id === id)!;
      await client.request(`/api/admin/resources/access/${encodeURIComponent(id)}`, {
        method: "PATCH", body: JSON.stringify({ enabled: record.enabled === false }),
      });
      console.log("Estado actualizado.");
      return;
    }
    const apps = applications.filter((item) => item.enabled !== false);
    const activeProviders = providers.filter((item) => item.enabled !== false);
    if (!apps.length || !activeProviders.length) return console.log("Se requiere al menos una aplicación y un proveedor activos.");
    const consumer_application_id = await choose("Aplicación", apps.map((app) => ({ name: String(app.name), value: app.id })));
    const provider_id = await choose("Proveedor", activeProviders.map((provider) => ({ name: String(provider.name), value: provider.id })));
    const rate_limit_per_minute = await askNumber("Límite por minuto opcional (vacío hereda el límite general)", undefined, true);
    await client.request("/api/admin/access", {
      method: "POST", body: JSON.stringify({ consumer_application_id, provider_id, enabled: true, rate_limit_per_minute }),
    });
    console.log("Acceso guardado.");
  } catch (error) {
    await handleScreenError(error);
  }
}
