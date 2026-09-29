#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildWslTuiCommand } from "./gateway-tui-command.mjs";

if (process.platform !== "win32") {
  console.error("gateway-tui is the Windows launcher; run `npm run tui` inside Ubuntu WSL.");
  process.exit(1);
}

const child = spawn("wsl.exe", [
  ...buildWslTuiCommand(fileURLToPath(new URL("../", import.meta.url))),
], { stdio: "inherit" });

child.once("error", () => {
  console.error("Could not start Ubuntu WSL. Check that the Ubuntu distribution is installed.");
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
