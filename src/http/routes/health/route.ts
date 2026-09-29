import { getDbPool } from "@/lib/db/pool";


export async function GET() {
  const startedAt = performance.now();
  try {
    await getDbPool().query("SELECT 1");
    return Response.json({
      status: "ok",
      database: "ok",
      durationMs: Math.round(performance.now() - startedAt),
    });
  } catch {
    return Response.json(
      { status: "degraded", database: "unavailable" },
      { status: 503 },
    );
  }
}
