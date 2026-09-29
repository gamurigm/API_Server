import type { AdminApiClient } from "@/tui/api-client";
import { ask, askOptional, choose, handleScreenError, loadRecords, showRecords } from "@/tui/menu";

export async function run(client: AdminApiClient): Promise<void> {
  try {
    const [records, applications] = await Promise.all([
      loadRecords(client, "/api/admin/identity-providers"),
      loadRecords(client, "/api/admin/applications"),
    ]);
    const action = await choose("Emisores JWT / JWKS", [
      { name: "Listar emisores", value: "list" },
      { name: "Registrar emisor", value: "create" },
      { name: "Activar / desactivar", value: "toggle" },
      { name: "Volver", value: "back" },
    ]);
    if (action === "back") return;
    if (action === "list") {
      showRecords("Emisores", records, ["name", "issuer", "jwks_uri", "audiences", "enabled"]);
      return;
    }
    if (action === "toggle") {
      if (!records.length) return console.log("No hay emisores para cambiar.");
      const id = await choose("Selecciona un emisor", records.map((record) => ({ name: `${record.name} (${record.enabled === false ? "inactivo" : "activo"})`, value: record.id })));
      const record = records.find((item) => item.id === id)!;
      await client.request(`/api/admin/resources/identity-providers/${encodeURIComponent(id)}`, {
        method: "PATCH", body: JSON.stringify({ enabled: record.enabled === false }),
      });
      console.log("Estado actualizado.");
      return;
    }
    const enabledApps = applications.filter((item) => item.enabled !== false);
    if (!enabledApps.length) return console.log("Primero crea y activa una aplicación.");
    const consumer_application_id = await choose("Aplicación", enabledApps.map((app) => ({ name: String(app.name), value: app.id })));
    const name = await ask("Nombre del emisor");
    const issuer = await ask("Issuer exacto (URL HTTPS)");
    const jwks_uri = await ask("JWKS URI (URL HTTPS)");
    const audiences = (await ask("Audiences separadas por coma")).split(",").map((value) => value.trim()).filter(Boolean);
    const scopes_claim = (await askOptional("Claim de scopes", "scope")) || "scope";
    const roles_claim = (await askOptional("Claim de roles", "roles")) || "roles";
    await client.request("/api/admin/identity-providers", {
      method: "POST", body: JSON.stringify({ consumer_application_id, name, issuer, jwks_uri, audiences, scopes_claim, roles_claim, enabled: true }),
    });
    console.log("Emisor registrado.");
  } catch (error) {
    await handleScreenError(error);
  }
}
