import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadLocalEnv() {
  let content;
  try {
    content = readFileSync(".env.local", "utf8");
  } catch {
    throw new Error("Falta .env.local. Créelo antes de ejecutar npm run local:setup.");
  }
  for (const line of content.split(/\r?\n/u)) {
    const match = /^([A-Z0-9_]+)=(.*)$/u.exec(line.trim());
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Falta ${name} en .env.local`);
  return value;
}

function fail(label, error) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

loadLocalEnv();
const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const localSupabaseHost = new URL(supabaseUrl).hostname;
if (!["127.0.0.1", "localhost", "::1"].includes(localSupabaseHost)) {
  throw new Error("local:setup solo puede ejecutarse contra un Supabase de loopback");
}
const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const adminEmail = requireEnv("LOCAL_ADMIN_EMAIL");
const adminPassword = requireEnv("LOCAL_ADMIN_PASSWORD");
const providerSecret = requireEnv("LOCAL_PROVIDER_SECRET");
const gatewayOrigin = new URL(requireEnv("NEXT_PUBLIC_APP_URL")).origin;
const fixturePort = Number(process.env.LOCAL_FIXTURE_PORT ?? 4010);
const fixtureUrl = `http://127.0.0.1:${fixturePort}`;
const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: usersPage, error: usersError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
fail("No se pudieron consultar los usuarios locales", usersError);
let adminUser = usersPage.users.find((user) => user.email?.toLowerCase() === adminEmail.toLowerCase());
if (!adminUser) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
    user_metadata: { name: "Administrador local" },
  });
  fail("No se pudo crear el administrador local", error);
  adminUser = data.user;
} else {
  const { error } = await supabase.auth.admin.updateUserById(adminUser.id, {
    password: adminPassword,
    email_confirm: true,
  });
  fail("No se pudo actualizar el administrador local", error);
}

const { error: profileError } = await supabase.from("profiles").upsert({
  id: adminUser.id,
  email: adminEmail,
  display_name: "Administrador local",
  role: "admin",
  enabled: true,
});
fail("No se pudo preparar el perfil administrador", profileError);

const { data: application, error: applicationError } = await supabase
  .from("consumer_applications")
  .upsert({
    name: "Aplicación local de prueba",
    slug: "local-client",
    description: "Consumidor RS256 usado únicamente en desarrollo local",
    enabled: true,
    rate_limit_per_minute: 120,
  }, { onConflict: "slug" })
  .select("id")
  .single();
fail("No se pudo crear la aplicación consumidora", applicationError);

const { error: issuerError } = await supabase.from("identity_providers").upsert({
  consumer_application_id: application.id,
  name: "Issuer RS256 local",
  issuer: fixtureUrl,
  jwks_uri: `${fixtureUrl}/jwks.json`,
  audiences: ["local-client"],
  scopes_claim: "scope",
  roles_claim: "roles",
  enabled: true,
}, { onConflict: "consumer_application_id,issuer" });
fail("No se pudo registrar el issuer local", issuerError);

const { data: provider, error: providerError } = await supabase
  .from("providers")
  .upsert({
    name: "Proveedor financiero simulado",
    slug: "local-market",
    description: "API local que comprueba la inyección de una API key",
    base_url: `${fixtureUrl}/provider`,
    auth_type: "api_key_header",
    auth_config: { headerName: "X-API-Key" },
    timeout_ms: 10_000,
    sse_timeout_ms: 30_000,
    rate_limit_per_minute: 120,
    enabled: true,
  }, { onConflict: "slug" })
  .select("id")
  .single();
fail("No se pudo crear el proveedor local", providerError);

const routes = [
  { method: "GET", path_template: "/v1/quotes/{symbol}", operation_id: "localQuote", supports_sse: false },
  { method: "POST", path_template: "/v1/echo", operation_id: "localEcho", supports_sse: false },
  { method: "GET", path_template: "/v1/stream", operation_id: "localStream", supports_sse: true },
].map((route) => ({
  ...route,
  provider_id: provider.id,
  description: "Ruta local de verificación",
  required_scopes: ["market:read"],
  allowed_request_headers: [],
  allowed_response_headers: ["X-Provider-Limit"],
  enabled: true,
  source: "manual",
}));
const { error: routeError } = await supabase
  .from("provider_routes")
  .upsert(routes, { onConflict: "provider_id,method,path_template" });
fail("No se pudieron crear las rutas locales", routeError);

const { error: accessError } = await supabase.from("application_provider_access").upsert({
  consumer_application_id: application.id,
  provider_id: provider.id,
  enabled: true,
  rate_limit_per_minute: 120,
}, { onConflict: "consumer_application_id,provider_id" });
fail("No se pudo autorizar la aplicación", accessError);

const { error: originError } = await supabase.from("application_origins").upsert({
  consumer_application_id: application.id,
  origin: gatewayOrigin,
  enabled: true,
}, { onConflict: "consumer_application_id,origin" });
fail("No se pudo registrar el origen local", originError);

const { data: credential, error: credentialLookupError } = await supabase
  .from("credentials")
  .select("id")
  .eq("provider_id", provider.id)
  .eq("owner_type", "shared")
  .eq("enabled", true)
  .maybeSingle();
fail("No se pudo consultar la credencial local", credentialLookupError);
if (!credential) {
  const { error } = await supabase.rpc("create_gateway_credential", {
    p_provider_id: provider.id,
    p_owner_type: "shared",
    p_consumer_application_id: null,
    p_label: "Secreto local",
    p_secret: providerSecret,
  });
  fail("No se pudo guardar la credencial en Vault", error);
}

console.log("Datos locales preparados correctamente.");
console.log(`Portal: ${gatewayOrigin}`);
console.log(`Administrador: ${adminEmail}`);
console.log("Acceso: botón local de un clic; la contraseña permanece solo en .env.local");
console.log(`Fixture RS256/proveedor: ${fixtureUrl}`);
