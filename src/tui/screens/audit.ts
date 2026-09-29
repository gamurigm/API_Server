import type { AdminApiClient } from "@/tui/api-client";
import { askNumber, handleScreenError } from "@/tui/menu";

interface AuditRecord {
  id: string;
  created_at: string;
  method: string;
  path: string;
  upstream_status?: number | null;
  gateway_error_code?: string | null;
  duration_ms: number;
}

export async function run(client: AdminApiClient): Promise<void> {
  try {
    const requestedLimit = await askNumber("Cantidad de eventos recientes (1–500)", 100);
    const limit = Math.min(requestedLimit ?? 100, 500);
    const { data } = await client.request<{ data: AuditRecord[] }>(`/api/admin/audit?limit=${limit}`);
    console.log(`\nAuditoría reciente (${data.length}) · solo metadatos; no incluye cuerpos, tokens ni secretos`);
    console.table(data.map((record) => ({
      fecha: new Date(record.created_at).toLocaleString(),
      solicitud: `${record.method} ${record.path}`,
      resultado: record.upstream_status ?? record.gateway_error_code ?? "—",
      duración_ms: record.duration_ms,
    })));
  } catch (error) {
    await handleScreenError(error);
  }
}
