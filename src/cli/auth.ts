import type { TuiSession } from "@/tui/auth";
import { signIn, signOut } from "@/tui/auth";
import { readTuiConfig } from "@/tui/config";

export async function withAdminSession<T>(password: string, action: (session: TuiSession) => Promise<T>): Promise<T> {
  const config = readTuiConfig(process.env);
  let health: Response;
  try {
    health = await fetch(new URL("/api/health", config.apiUrl), { redirect: "error" });
  } catch {
    throw new Error(`No se puede conectar al backend local en ${config.apiUrl.origin}. Inicia el backend local.`);
  }
  if (!health.ok) throw new Error(`El backend local respondió HTTP ${health.status}`);

  const session = await signIn(password, config);
  try {
    return await action(session);
  } finally {
    await signOut(session).catch(() => undefined);
  }
}
