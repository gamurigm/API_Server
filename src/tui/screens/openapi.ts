import inquirer from "inquirer";

import type { AdminApiClient } from "@/tui/api-client";
import { choose, handleScreenError, loadRecords } from "@/tui/menu";

export async function run(client: AdminApiClient): Promise<void> {
  try {
    const providers = (await loadRecords(client, "/api/admin/providers")).filter((item) => item.enabled !== false);
    if (!providers.length) return console.log("Primero crea y activa un proveedor.");
    const provider_id = await choose("Proveedor de destino", providers.map((provider) => ({ name: String(provider.name), value: provider.id })));
    const { document } = await inquirer.prompt<{ document: string }>({
      type: "editor",
      name: "document",
      message: "Documento OpenAPI JSON/YAML (se abrirá el editor configurado; guarda y cierra)",
      default: "openapi: 3.1.0\ninfo:\n  title: Example API\n  version: 1.0.0\npaths:\n",
      validate: (value: string) => (value.trim() ? true : "El documento no puede estar vacío"),
    });
    const result = await client.request<{ data: { imported: number } }>("/api/admin/openapi/import", {
      method: "POST", body: JSON.stringify({ provider_id, document }),
    });
    console.log(`Importación completada: ${result.data.imported} operaciones registradas o actualizadas.`);
  } catch (error) {
    await handleScreenError(error);
  }
}
