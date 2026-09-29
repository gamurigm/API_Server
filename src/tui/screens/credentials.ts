import type { AdminApiClient } from "@/tui/api-client";
import { ask, askConfirm, askSecret, choose, handleScreenError, loadRecords, showRecords } from "@/tui/menu";

export async function run(client: AdminApiClient): Promise<void> {
  try {
    const records = await loadRecords(client, "/api/admin/credentials");
    const action = await choose("Credenciales de Vault", [
      { name: "Listar metadatos", value: "list" },
      { name: "Guardar credencial", value: "create" },
      { name: "Activar / desactivar", value: "toggle" },
      { name: "Eliminar credencial", value: "delete" },
      { name: "Volver", value: "back" },
    ]);
    if (action === "back") return;
    if (action === "list") {
      showRecords("Credenciales (sin valores secretos)", records, ["label", "provider_id", "owner_type", "consumer_application_id", "enabled", "created_at"]);
      return;
    }
    if (action === "toggle") {
      if (!records.length) return console.log("No hay credenciales para cambiar.");
      const id = await choose("Selecciona una credencial", records.map((record) => ({ name: `${record.label} (${record.enabled === false ? "inactiva" : "activa"})`, value: record.id })));
      const record = records.find((item) => item.id === id)!;
      await client.request(`/api/admin/resources/credentials/${encodeURIComponent(id)}`, {
        method: "PATCH", body: JSON.stringify({ enabled: record.enabled === false }),
      });
      console.log("Estado actualizado.");
      return;
    }
    if (action === "delete") {
      if (!records.length) return console.log("No hay credenciales para eliminar.");
      const id = await choose("Selecciona la credencial que se eliminará", records.map((record) => ({
        name: `${record.label} (${record.enabled === false ? "inactiva" : "activa"})`,
        value: record.id,
      })));
      const record = records.find((item) => item.id === id)!;
      if (!await askConfirm(`Eliminar permanentemente «${record.label}» y su secreto de Vault?`, false)) {
        console.log("Eliminación cancelada.");
        return;
      }
      await client.request(`/api/admin/resources/credentials/${encodeURIComponent(id)}`, { method: "DELETE" });
      console.log("Credencial y secreto eliminados de forma permanente.");
      return;
    }

    const [providers, applications] = await Promise.all([
      loadRecords(client, "/api/admin/providers"),
      loadRecords(client, "/api/admin/applications"),
    ]);
    const activeProviders = providers.filter((item) => item.enabled !== false);
    if (!activeProviders.length) return console.log("Primero crea y activa un proveedor.");
    const provider_id = await choose("Proveedor", activeProviders.map((provider) => ({ name: String(provider.name), value: provider.id })));
    const owner_type = await choose("Propietario de la credencial", [
      { name: "Compartida por todas las aplicaciones", value: "shared" },
      { name: "Una aplicación específica", value: "application" },
    ]);
    let consumer_application_id: string | null = null;
    if (owner_type === "application") {
      const apps = applications.filter((item) => item.enabled !== false);
      if (!apps.length) return console.log("No hay aplicaciones activas.");
      consumer_application_id = await choose("Aplicación", apps.map((app) => ({ name: String(app.name), value: app.id })));
    }
    const label = await ask("Etiqueta de la credencial");
    let secret = await askSecret("Valor secreto (no se mostrará en pantalla)");
    try {
      await client.request("/api/admin/credentials", {
        method: "POST", body: JSON.stringify({ provider_id, owner_type, consumer_application_id, label, secret }),
      });
    } finally {
      secret = "";
    }
    console.log("Credencial guardada en Vault. El valor no puede volver a consultarse.");
  } catch (error) {
    await handleScreenError(error);
  }
}
