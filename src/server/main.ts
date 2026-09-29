import { serve } from "@hono/node-server";

import { app } from "@/server/app";
import { getServerEnv } from "@/lib/env";
import { closeDbPool } from "@/lib/db/pool";

const env = getServerEnv();
const host = "127.0.0.1";
const server = serve({
  fetch: app.fetch,
  hostname: host,
  port: env.GATEWAY_HTTP_PORT,
});

server.once("listening", () => {
  console.log(`Federated API Gateway listening on http://${host}:${env.GATEWAY_HTTP_PORT}`);
});

server.once("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${env.GATEWAY_HTTP_PORT} is already in use; change GATEWAY_HTTP_PORT or stop its owner.`);
  } else {
    console.error("The API server could not start.");
  }
  process.exitCode = 1;
});

let closing = false;
async function shutdown(): Promise<void> {
  if (closing) return;
  closing = true;
  server.close(async (error) => {
    await closeDbPool();
    if (error) {
      console.error("The API server did not close cleanly.");
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
