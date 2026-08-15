import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/u)) {
  const match = /^([A-Z0-9_]+)=(.*)$/u.exec(line.trim());
  if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
}

const gatewayUrl = process.env.NEXT_PUBLIC_APP_URL;
const fixtureUrl = `http://127.0.0.1:${process.env.LOCAL_FIXTURE_PORT ?? 4010}`;
if (!gatewayUrl) throw new Error("Falta NEXT_PUBLIC_APP_URL en .env.local");
if (!["127.0.0.1", "localhost", "::1"].includes(new URL(gatewayUrl).hostname)) {
  throw new Error("local:test solo puede ejecutarse contra un gateway de loopback");
}
if (!process.env.LOCAL_ADMIN_PASSWORD) throw new Error("Falta LOCAL_ADMIN_PASSWORD en .env.local");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const portalClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
const { data: portalSession, error: portalLoginError } = await portalClient.auth.signInWithPassword({
  email: process.env.LOCAL_ADMIN_EMAIL,
  password: process.env.LOCAL_ADMIN_PASSWORD,
});
assert(!portalLoginError && portalSession.user?.email === process.env.LOCAL_ADMIN_EMAIL, "El login administrador local falló");
await portalClient.auth.signOut();

const loginPageResponse = await fetch(`${gatewayUrl}/login`);
const loginPage = await loginPageResponse.text();
assert(loginPageResponse.ok, `La página de login devolvió ${loginPageResponse.status}`);
assert(
  loginPageResponse.headers.get("content-security-policy")?.includes("form-action 'self'"),
  "La página de login no restringe el destino de los formularios mediante CSP",
);
assert(
  !loginPage.includes(process.env.LOCAL_ADMIN_PASSWORD),
  "La contraseña local apareció en el HTML del navegador",
);
assert(!/name=["']password["']/iu.test(loginPage), "El login local todavía expone un campo password");

const sensitiveLoginUrl = new URL("/login", gatewayUrl);
sensitiveLoginUrl.searchParams.set("email", "test@example.invalid");
sensitiveLoginUrl.searchParams.set("password", "placeholder-not-a-secret");
const sanitizedLoginResponse = await fetch(sensitiveLoginUrl, { redirect: "manual" });
assert(
  [307, 308].includes(sanitizedLoginResponse.status),
  `Los parámetros sensibles no se limpiaron; el login devolvió ${sanitizedLoginResponse.status}`,
);
const sanitizedLocation = sanitizedLoginResponse.headers.get("location") ?? "";
assert(
  !sanitizedLocation.includes("test@example.invalid") &&
    !sanitizedLocation.includes("placeholder-not-a-secret"),
  "La redirección conservó credenciales en la URL",
);

const localLoginGet = await fetch(`${gatewayUrl}/auth/local`, { redirect: "manual" });
assert(localLoginGet.status === 405, `El login local por GET devolvió ${localLoginGet.status}, no 405`);

const crossOriginLogin = await fetch(`${gatewayUrl}/auth/local`, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    Origin: "https://attacker.invalid",
    "Sec-Fetch-Site": "cross-site",
  },
  body: "",
  redirect: "manual",
});
assert(crossOriginLogin.status === 403, `El POST cross-origin devolvió ${crossOriginLogin.status}, no 403`);

const browserWithoutOrigin = await fetch(`${gatewayUrl}/auth/local`, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "Sec-Fetch-Site": "same-origin",
  },
  body: "",
  redirect: "manual",
});
assert(
  browserWithoutOrigin.status === 303,
  `El navegador local sin cabecera Origin devolvió ${browserWithoutOrigin.status}`,
);

const gatewayOrigin = new URL(gatewayUrl).origin;
const localLoginResponse = await fetch(`${gatewayUrl}/auth/local`, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    Origin: gatewayOrigin,
    "Sec-Fetch-Site": "same-origin",
  },
  body: "",
  redirect: "manual",
});
assert(localLoginResponse.status === 303, `El login local seguro devolvió ${localLoginResponse.status}`);
assert(
  localLoginResponse.headers.get("cache-control") === "no-store",
  "La respuesta de autenticación local puede almacenarse en caché",
);
const sessionCookies = localLoginResponse.headers.getSetCookie();
assert(sessionCookies.length > 0, "El login local no estableció una cookie de sesión");
assert(
  !sessionCookies.some((cookie) => cookie.includes(process.env.LOCAL_ADMIN_PASSWORD)),
  "La contraseña local apareció en una cookie",
);
const cookieHeader = sessionCookies.map((cookie) => cookie.split(";", 1)[0]).join("; ");
const authenticatedPortal = await fetch(gatewayUrl, {
  headers: { Cookie: cookieHeader },
  redirect: "manual",
});
assert(authenticatedPortal.status === 200, `La sesión local no abrió el portal: ${authenticatedPortal.status}`);

const direct = await fetch(`${fixtureUrl}/provider/v1/quotes/NVDA`);
assert(direct.status === 401, `El proveedor directo debía rechazar la llamada; devolvió ${direct.status}`);

const tokenResponse = await fetch(`${fixtureUrl}/token`);
assert(tokenResponse.ok, "El issuer local no entregó un token");
const { access_token: token } = await tokenResponse.json();
const authorization = { Authorization: `Bearer ${token}` };

const quoteResponse = await fetch(
  `${gatewayUrl}/api/v1/gateway/local-market/v1/quotes/NVDA?interval=1h`,
  { headers: authorization },
);
const quote = await quoteResponse.json();
assert(quoteResponse.status === 200, `La cotización devolvió ${quoteResponse.status}`);
assert(quote.credentialInjected === true, "El proveedor no recibió la API key inyectada");
assert(quote.symbol === "NVDA" && quote.interval === "1h", "La ruta o el query cambiaron en el proxy");

const echoResponse = await fetch(`${gatewayUrl}/api/v1/gateway/local-market/v1/echo`, {
  method: "POST",
  headers: { ...authorization, "Content-Type": "application/json" },
  body: JSON.stringify({ message: "hola desde una app externa" }),
});
const echo = await echoResponse.json();
assert(echoResponse.status === 200, `El POST devolvió ${echoResponse.status}`);
assert(echo.received?.message === "hola desde una app externa", "El JSON no llegó intacto");

const invalidResponse = await fetch(`${gatewayUrl}/api/v1/gateway/local-market/v1/quotes/NVDA`, {
  headers: { Authorization: "Bearer invalid-token" },
});
const invalid = await invalidResponse.json();
assert(invalidResponse.status === 401 && invalid.error?.code === "invalid_token", "No se rechazó el JWT inválido");

console.log("Prueba local completa: OK");
console.log(JSON.stringify({
  directProviderStatus: direct.status,
  gatewayStatus: quoteResponse.status,
  response: quote,
  postStatus: echoResponse.status,
  invalidTokenStatus: invalidResponse.status,
  portalLoginStatus: "ok",
  loginGetStatus: localLoginGet.status,
  crossOriginLoginStatus: crossOriginLogin.status,
  originlessBrowserStatus: browserWithoutOrigin.status,
  localSessionStatus: authenticatedPortal.status,
  sensitiveUrlSanitized: true,
  requestId: quoteResponse.headers.get("x-gateway-request-id"),
}, null, 2));
