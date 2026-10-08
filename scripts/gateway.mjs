#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const checkoutPath = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const child = process.platform === "win32"
  ? spawn("wsl.exe", [
    "--distribution", "Ubuntu", "--cd", checkoutPath, "--exec", "bash", "-lc",
    'npm run admin:cli -- "$@"', "gateway", ...args,
  ], { stdio: "inherit" })
  : spawn(process.execPath, ["--env-file=.env.tui.local", "scripts/run-cli.mjs", ...args], {
    cwd: checkoutPath,
    stdio: "inherit",
  });

child.once("error", () => {
  console.error("No se pudo iniciar el CLI local. Comprueba Node.js y, en Windows, Ubuntu WSL.");
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
