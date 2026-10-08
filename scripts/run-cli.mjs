import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { adminClientEnv } from "./admin-client-env.mjs";

const exitCode = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ["--import", "tsx", "src/cli/main.ts", ...process.argv.slice(2)], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: adminClientEnv(),
    stdio: "inherit",
  });
  child.once("error", reject);
  child.once("exit", (code) => resolve(code ?? 1));
});

process.exitCode = exitCode;
