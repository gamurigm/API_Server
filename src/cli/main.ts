import type { AdminApiClient } from "@/admin-client/api-client";
import { createArea, deleteAreaRecord, loadArea, setAreaEnabled, updateArea } from "@/admin-client/operations";
import { ADMIN_AREA_BY_ID } from "@/admin-client/resources";
import { withAdminSession } from "@/cli/auth";
import { printDeleted, printResult, printRows } from "@/cli/format";
import { chooseRecord, confirmAction, promptAreaData, promptPassword, readStdinInput, rejectUnsafeInput, stdinData } from "@/cli/input";
import { helpText, parseCliCommand } from "@/cli/parser";

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  try {
    const command = parseCliCommand(argv);
    if (command.tui) {
      if (command.help) console.log("Uso: gateway tui");
      else await (await import("@/tui/run")).runTui();
      return;
    }
    if (command.help || !command.areaId) {
      console.log(helpText(command.areaId));
      return;
    }
    if (!command.action) throw new Error(helpText(command.areaId));

    const area = ADMIN_AREA_BY_ID[command.areaId];
    const stdinInput = command.inputJson ? await readStdinInput() : undefined;
    let password = stdinInput?.password ?? "";
    if (!password) {
      if (!process.stdin.isTTY) throw new Error("En modo no interactivo usa --input-json con password por stdin.");
      password = await promptPassword();
    }
    if (stdinInput) stdinInput.password = undefined;

    try {
      await withAdminSession(password, async (session) => {
        await runAreaCommand(session.api, area, command, stdinInput);
      });
    } finally {
      password = "";
      if (stdinInput) stdinInput.data = undefined;
    }
  } catch (error) {
    if (error instanceof Error && ["ExitPromptError", "AbortPromptError"].includes(error.name)) return;
    console.error(error instanceof Error ? error.message : "Error inesperado en el CLI");
    process.exitCode = 1;
  }
}

async function runAreaCommand(
  client: AdminApiClient,
  area: (typeof ADMIN_AREA_BY_ID)[keyof typeof ADMIN_AREA_BY_ID],
  command: ReturnType<typeof parseCliCommand>,
  stdinInput?: Awaited<ReturnType<typeof readStdinInput>>,
): Promise<void> {
  const action = command.action!;
  if (action === "list") {
    if (area.import) throw new Error("OpenAPI no tiene listado; usa `gateway openapi import`.");
    printRows(area, await loadArea(client, area, command.limit), command.json);
    return;
  }

  if (action === "create" || action === "import") {
    if (area.readOnly || !area.fields?.length) throw new Error("Esta área no permite crear registros.");
    if (area.import !== (action === "import")) throw new Error("Usa la acción import únicamente en openapi.");
    const data = command.inputJson
      ? stdinData(stdinInput?.data)
      : await promptAreaData(client, area, "create");
    rejectUnsafeInput(area, data);
    const result = await createArea(client, area, data);
    printResult(area, area.import ? "import" : "create", result, command.json);
    return;
  }

  if (action === "edit") {
    if (!area.editFields?.length) throw new Error("Esta área no permite editar registros.");
    const row = await findRecord(client, area, command.id, command.limit);
    const data = command.inputJson
      ? stdinData(stdinInput?.data)
      : await promptAreaData(client, area, "edit", row);
    rejectUnsafeInput(area, data);
    printResult(area, "edit", await updateArea(client, area, row.id, data), command.json);
    return;
  }

  if (action === "enable" || action === "disable") {
    if (!area.columns.includes("enabled") && area.id !== "credentials") throw new Error("Esta área no admite activar/desactivar.");
    const row = await findRecord(client, area, command.id, command.limit);
    printResult(area, action, await updateArea(client, area, row.id, { enabled: action === "enable" }), command.json);
    return;
  }

  if (action === "toggle") {
    if (!area.columns.includes("enabled") && area.id !== "credentials") throw new Error("Esta área no admite activar/desactivar.");
    const row = await findRecord(client, area, command.id, command.limit);
    printResult(area, action, await setAreaEnabled(client, area, row), command.json);
    return;
  }

  if (action === "delete" || action === "revoke") {
    if (action === "revoke" && !area.revoke) throw new Error("Esta área no admite revocación.");
    if (action === "delete" && !area.delete) throw new Error(area.revoke ? "Usa la acción revoke para las claves." : "Esta área no admite eliminación.");
    const row = await findRecord(client, area, command.id, command.limit);
    if (!command.yes) {
      if (!process.stdin.isTTY) throw new Error("La operación destructiva requiere --yes en modo no interactivo.");
      const confirmed = await confirmAction(`${action === "revoke" ? "Revocar permanentemente" : "Eliminar"} ${String(row.name ?? row.label ?? row.path_template ?? row.id)}?`);
      if (!confirmed) return;
    }
    await deleteAreaRecord(client, area, row.id);
    printDeleted(area, action, row.id, command.json);
    return;
  }

  throw new Error(`Acción no disponible: ${action}.\n${helpText(area.id)}`);
}

async function findRecord(
  client: AdminApiClient,
  area: (typeof ADMIN_AREA_BY_ID)[keyof typeof ADMIN_AREA_BY_ID],
  id: string | undefined,
  limit: number,
) {
  const rows = await loadArea(client, area, limit);
  if (id) {
    const row = rows.find((item) => item.id === id);
    if (!row) throw new Error("No se encontró el registro indicado.");
    return row;
  }
  if (!process.stdin.isTTY) throw new Error("Esta acción requiere id o una terminal interactiva.");
  return chooseRecord(area, rows);
}

await runCli();
