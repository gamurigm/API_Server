import Link from "next/link";

import { AdminConsole } from "@/app/admin-console";
import { requireAdminPage } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function loadPortalData() {
  const admin = createAdminClient();
  const [applications, issuers, providers, routes, access, credentials, origins, audit] = await Promise.all([
    admin.from("consumer_applications").select("*").order("name"),
    admin.from("identity_providers").select("*, consumer_applications(name, slug)").order("name"),
    admin.from("providers").select("*").order("name"),
    admin.from("provider_routes").select("*").order("path_template"),
    admin.from("application_provider_access").select("*, consumer_applications(name, slug), providers(name, slug)").order("created_at", { ascending: false }),
    admin.from("credentials").select("id, provider_id, owner_type, consumer_application_id, label, enabled, created_at, updated_at, providers(name, slug), consumer_applications(name, slug)").order("created_at", { ascending: false }),
    admin.from("application_origins").select("*, consumer_applications(name, slug)").order("origin"),
    admin.from("invocations").select("*").order("created_at", { ascending: false }).limit(100),
  ]);

  const failed = [applications, issuers, providers, routes, access, credentials, origins, audit].find((result) => result.error);
  if (failed?.error) throw new Error(`Portal database query failed: ${failed.error.code}`);
  return {
    applications: applications.data ?? [], identityProviders: issuers.data ?? [], providers: providers.data ?? [],
    routes: routes.data ?? [], access: access.data ?? [], credentials: credentials.data ?? [], origins: origins.data ?? [], audit: audit.data ?? [],
  };
}

export default async function HomePage() {
  const admin = await requireAdminPage();
  const data = await loadPortalData();
  return <main className="shell">
    <header className="topbar"><div className="brand"><div className="brand-mark">FG</div><div><h1>Federated Gateway</h1><p>RS256 · JWKS · Vault · Proxy transparente</p></div></div>
      <div className="top-actions"><span>{admin.email}</span><Link className="button small" href="/docs">Documentación</Link><form action="/auth/signout" method="post"><button className="button small" type="submit">Salir</button></form></div>
    </header>
    <section className="hero"><div className="panel panel-body"><div className="eyebrow">Control plane</div><h2>Una puerta segura para todas tus APIs.</h2><p>Las aplicaciones conservan su autenticación. El gateway valida sus JWT RS256, inyecta credenciales externas y devuelve la respuesta original.</p></div>
      <div className="panel panel-body"><div className="eyebrow">Solicitud</div><div className="code">GET /api/v1/gateway/market/quotes/NVDA{"\n"}Authorization: Bearer &lt;jwt-rs256&gt;</div></div></section>
    <section className="stats">{[
      ["Aplicaciones", data.applications.length], ["Issuers RS256", data.identityProviders.length], ["Proveedores", data.providers.length], ["Rutas", data.routes.length],
    ].map(([label, value]) => <div className="panel stat" key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>
    <AdminConsole data={data} />
  </main>;
}
