import { promptForPassword, signIn, signOut } from "@/tui/auth";
import { readTuiConfig } from "@/tui/config";
import { startAdminTui } from "@/tui/app";

export async function runTui(): Promise<void> {
  let session: Awaited<ReturnType<typeof signIn>> | undefined;
  try {
    const config = readTuiConfig(process.env);
    let health: Response;
    try {
      health = await fetch(new URL("/api/health", config.apiUrl), { redirect: "error" });
    } catch {
      throw new Error(`No se puede conectar al backend local en ${config.apiUrl.origin}. Ejecuta npm run dev:local en otra terminal.`);
    }
    if (!health.ok) throw new Error(`El backend local respondió HTTP ${health.status}. Verifica npm run dev:local.`);

    console.log("Gateway local · acceso administrativo");
    let password = await promptForPassword();
    try {
      session = await signIn(password, config);
    } finally {
      password = "";
    }
    await startAdminTui(session);
  } catch (error) {
    if (!isPromptCancelled(error)) {
      console.error(error instanceof Error ? error.message : "Error inesperado en el TUI");
      process.exitCode = 1;
    }
  } finally {
    if (session) await signOut(session).catch(() => undefined);
    console.log("Sesión cerrada. Hasta luego.");
  }
}

export function isPromptCancelled(error: unknown): boolean {
  return error instanceof Error && ["ExitPromptError", "AbortPromptError"].includes(error.name);
}
