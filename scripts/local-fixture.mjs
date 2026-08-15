import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

function loadLocalEnv() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/u)) {
      const match = /^([A-Z0-9_]+)=(.*)$/u.exec(line.trim());
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
    }
  } catch {
    // The setup command reports a clearer error if .env.local is missing.
  }
}

loadLocalEnv();
const port = Number(process.env.LOCAL_FIXTURE_PORT ?? 4010);
const providerSecret = process.env.LOCAL_PROVIDER_SECRET ?? "local-upstream-key-change-me";
const issuer = `http://127.0.0.1:${port}`;
const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
const publicJwk = {
  ...(await exportJWK(publicKey)),
  alg: "RS256",
  kid: "local-test-key",
  use: "sig",
};

function json(response, status, body, headers = {}) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_048_576) throw new Error("body_too_large");
    chunks.push(chunk);
  }
  if (size === 0) return null;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function authorized(request) {
  return request.headers["x-api-key"] === providerSecret;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", issuer);
  if (request.method === "GET" && url.pathname === "/health") {
    return json(response, 200, { status: "ok" });
  }
  if (request.method === "GET" && url.pathname === "/jwks.json") {
    return json(response, 200, { keys: [publicJwk] });
  }
  if (request.method === "GET" && url.pathname === "/token") {
    const accessToken = await new SignJWT({ scope: "market:read profile", roles: ["tester"] })
      .setProtectedHeader({ alg: "RS256", kid: "local-test-key" })
      .setIssuer(issuer)
      .setSubject("local-user-001")
      .setAudience("local-client")
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(privateKey);
    return json(response, 200, { access_token: accessToken, token_type: "Bearer", expires_in: 600 });
  }

  if (url.pathname.startsWith("/provider/") && !authorized(request)) {
    return json(response, 401, { error: "provider_credential_missing" });
  }

  const quoteMatch = /^\/provider\/v1\/quotes\/([^/]+)$/u.exec(url.pathname);
  if (request.method === "GET" && quoteMatch) {
    return json(response, 200, {
      source: "local-mock-provider",
      symbol: decodeURIComponent(quoteMatch[1]),
      interval: url.searchParams.get("interval") ?? "1d",
      price: 123.45,
      credentialInjected: true,
    }, { "X-Provider-Limit": "999" });
  }

  if (request.method === "POST" && url.pathname === "/provider/v1/echo") {
    try {
      return json(response, 200, { source: "local-mock-provider", received: await readJson(request) });
    } catch {
      return json(response, 400, { error: "invalid_json" });
    }
  }

  if (request.method === "GET" && url.pathname === "/provider/v1/stream") {
    response.writeHead(200, {
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
    });
    let eventId = 0;
    const timer = setInterval(() => {
      eventId += 1;
      response.write(`id: ${eventId}\ndata: ${JSON.stringify({ price: 123.45 + eventId })}\n\n`);
      if (eventId === 3) {
        clearInterval(timer);
        response.end();
      }
    }, 300);
    request.on("close", () => clearInterval(timer));
    return;
  }

  return json(response, 404, { error: "fixture_route_not_found" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Local RS256 issuer and mock provider: ${issuer}`);
  console.log(`Token endpoint: ${issuer}/token`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
