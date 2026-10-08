import { ADMIN_AREAS, type AdminAreaId } from "@/admin-client/resources";

export interface CliCommand {
  areaId?: AdminAreaId;
  action?: string;
  id?: string;
  json: boolean;
  yes: boolean;
  inputJson: boolean;
  help: boolean;
  limit: number;
  tui: boolean;
}

const sensitiveOptions = new Set([
  "--password", "--admin-password", "--secret", "--upstream-secret", "--token",
]);

export function parseCliCommand(argv: string[]): CliCommand {
  const options = { json: false, yes: false, inputJson: false, help: false, limit: 100, id: undefined as string | undefined };
  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const flag = arg.split("=", 1)[0].toLowerCase();
    if (sensitiveOptions.has(flag)) throw new Error("No pases contraseñas ni secretos como argumentos. Usa entrada oculta o --input-json por stdin.");
    if (arg === "--json") options.json = true;
    else if (arg === "--yes" || arg === "-y") options.yes = true;
    else if (arg === "--input-json") options.inputJson = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--limit") {
      const value = argv[index + 1];
      if (!value || !/^\d+$/u.test(value)) throw new Error("--limit requiere un entero entre 1 y 500");
      options.limit = Number(value);
      if (options.limit < 1 || options.limit > 500) throw new Error("--limit requiere un entero entre 1 y 500");
      index += 1;
    } else if (arg.startsWith("--id=")) options.id = arg.slice("--id=".length);
    else if (arg === "--id") {
      const value = argv[index + 1];
      if (!value) throw new Error("--id requiere un identificador");
      options.id = value;
      index += 1;
    } else if (arg.startsWith("-")) throw new Error("Opción no reconocida. Usa --help para ver la ayuda.");
    else positionals.push(arg);
  }

  if (positionals[0] === "tui") return { ...options, tui: true };
  if (positionals.length === 0 || options.help && positionals.length === 0) return { ...options, tui: false };
  const area = ADMIN_AREAS.find((item) => item.id === positionals[0]);
  if (!area) throw new Error("Área no reconocida. Usa gateway --help para ver las áreas disponibles.");
  const action = positionals[1];
  if (positionals.length > 3) throw new Error("Argumentos extra no permitidos.");
  const id = options.id ?? positionals[2];
  return { ...options, areaId: area.id, action, id, tui: false };
}

export function helpText(areaId?: AdminAreaId): string {
  const heading = "Uso: gateway <área> <acción> [id] [opciones]";
  if (areaId) {
    const area = ADMIN_AREAS.find((item) => item.id === areaId)!;
    const actions = ["list"];
    if (area.fields && !area.readOnly) actions.push(area.import ? "import" : "create");
    if (area.editFields?.length) actions.push("edit <id>");
    if (area.columns.includes("enabled") || area.id === "credentials") actions.push("enable <id>", "disable <id>", "toggle <id>");
    if (area.delete) actions.push("delete <id>");
    if (area.revoke) actions.push("revoke <id>");
    return `${area.label}\n\n${heading}\n\nAcciones: ${actions.join(", ")}\n\nOpciones: --json, --limit 1..500, --input-json, --yes, --help`;
  }
  return [
    "Gateway local · administración por terminal",
    "",
    "Uso: gateway tui",
    `     gateway <área> <acción> [id] [--json] [--input-json] [--yes] [--limit n]`,
    "",
    "Áreas:",
    ...ADMIN_AREAS.map((area) => `  ${area.id.padEnd(20)} ${area.label}`),
    "",
    "Acciones: list, create, edit, enable, disable, toggle, delete, revoke, import",
    "--input-json lee password y data desde stdin. Nunca pases secretos en argumentos.",
    "--yes confirma eliminaciones y revocaciones en scripts. --json emite JSON estructurado.",
  ].join("\n");
}
