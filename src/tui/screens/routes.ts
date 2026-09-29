import type { AdminApiClient } from "@/tui/api-client";
import { ask, askConfirm, askOptional, choose, handleScreenError, loadRecords, showRecords } from "@/tui/menu";

export async function run(client: AdminApiClient): Promise<void> {
  try {
    const [records, providers] = await Promise.all([
      loadRecords(client, "/api/admin/routes"),
      loadRecords(client, "/api/admin/providers"),
    ]);
    const action = await choose("Rutas permitidas", [
      { name: "Listar rutas", value: "list" },
      { name: "Crear ruta", value: "create" },
      { name: "Activar / desactivar", value: "toggle" },
      { name: "Volver", value: "back" },
    ]);
    if (action === "back") return;
    if (action === "list") {
      showRecords("Rutas", records, ["provider_id", "method", "path_template", "operation_id", "required_scopes", "supports_sse", "enabled"]);
      return;
    }
    if (action === "toggle") {
      if (!records.length) return console.log("No hay rutas para cambiar.");
      const id = await choose("Selecciona una ruta", records.map((record) => ({ name: `${record.method} ${record.path_template} (${record.enabled === false ? "inactiva" : "activa"})`, value: record.id })));
      const record = records.find((item) => item.id === id)!;
      await client.request(`/api/admin/resources/routes/${encodeURIComponent(id)}`, {
        method: "PATCH", body: JSON.stringify({ enabled: record.enabled === false }),
      });
      console.log("Estado actualizado.");
      return;
    }
    const enabledProviders = providers.filter((item) => item.enabled !== false);
    if (!enabledProviders.length) return console.log("Primero crea y activa un proveedor.");
    const provider_id = await choose("Proveedor", enabledProviders.map((provider) => ({ name: String(provider.name), value: provider.id })));
    const method = await choose("Método HTTP", ["GET", "POST", "PUT", "PATCH", "DELETE"].map((value) => ({ name: value, value })));
    const operation_id = await ask("Operation ID");
    const path_template = await ask("Path template (ej. /quotes/{symbol})");
    const description = await askOptional("Descripción (opcional)");
    const required_scopes = (await askOptional("Scopes requeridos separados por coma")).split(",").map((value) => value.trim()).filter(Boolean);
    const supports_sse = await askConfirm("¿Permitir streaming SSE?");
    await client.request("/api/admin/routes", {
      method: "POST", body: JSON.stringify({
        provider_id, method, path_template, operation_id, description: description || null,
        required_scopes, allowed_request_headers: [], allowed_response_headers: [],
        supports_sse, enabled: true, source: "manual",
      }),
    });
    console.log("Ruta creada.");
  } catch (error) {
    await handleScreenError(error);
  }
}
