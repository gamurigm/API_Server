import type { AdminApiClient } from "@/tui/api-client";
import { ask, askNumber, askOptional, choose, handleScreenError, loadRecords, showRecords } from "@/tui/menu";

export async function run(client: AdminApiClient): Promise<void> {
  try {
    const records = await loadRecords(client, "/api/admin/providers");
    const action = await choose("Proveedores upstream", [
      { name: "Listar proveedores", value: "list" },
      { name: "Crear proveedor", value: "create" },
      { name: "Activar / desactivar", value: "toggle" },
      { name: "Volver", value: "back" },
    ]);
    if (action === "back") return;
    if (action === "list") {
      showRecords("Proveedores", records, ["name", "slug", "base_url", "auth_type", "rate_limit_per_minute", "enabled"]);
      return;
    }
    if (action === "toggle") {
      if (!records.length) return console.log("No hay proveedores para cambiar.");
      const id = await choose("Selecciona un proveedor", records.map((record) => ({ name: `${record.name} (${record.enabled === false ? "inactivo" : "activo"})`, value: record.id })));
      const record = records.find((item) => item.id === id)!;
      await client.request(`/api/admin/resources/providers/${encodeURIComponent(id)}`, {
        method: "PATCH", body: JSON.stringify({ enabled: record.enabled === false }),
      });
      console.log("Estado actualizado.");
      return;
    }
    const name = await ask("Nombre");
    const slug = await ask("Slug");
    const base_url = await ask("Base URL HTTPS");
    const description = await askOptional("Descripción (opcional)");
    const auth_type = await choose("Autenticación upstream", [
      { name: "Ninguna", value: "none" },
      { name: "Bearer estático (credencial en Vault)", value: "bearer_static" },
      { name: "API key en header", value: "api_key_header" },
      { name: "API key en query", value: "api_key_query" },
    ]);
    const auth_name = auth_type === "api_key_header" || auth_type === "api_key_query"
      ? await askOptional("Nombre de header/query", auth_type === "api_key_header" ? "X-API-Key" : "api_key")
      : "";
    const rate_limit_per_minute = await askNumber("Límite por minuto", 60);
    const auth_config = auth_type === "api_key_header" ? { headerName: auth_name || "X-API-Key" }
      : auth_type === "api_key_query" ? { queryName: auth_name || "api_key" } : {};
    await client.request("/api/admin/providers", {
      method: "POST", body: JSON.stringify({
        name, slug, base_url, description: description || null, auth_type, auth_config,
        timeout_ms: 25000, sse_timeout_ms: 300000, rate_limit_per_minute, enabled: true,
      }),
    });
    console.log("Proveedor creado.");
  } catch (error) {
    await handleScreenError(error);
  }
}
