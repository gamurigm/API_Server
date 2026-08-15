import Link from "next/link";

import { AdminConsole } from "@/app/admin-console";
import { Icon, type IconName } from "@/app/ui-icons";
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
  const setupSteps = [
    { label: "Aplicación", ready: data.applications.length > 0 },
    { label: "Emisor JWT", ready: data.identityProviders.length > 0 },
    { label: "Proveedor", ready: data.providers.length > 0 },
    { label: "Rutas", ready: data.routes.length > 0 },
    { label: "Acceso", ready: data.access.length > 0 },
    { label: "Credencial", ready: data.credentials.length > 0 },
  ];
  const completedSteps = setupSteps.filter((step) => step.ready).length;
  const completion = Math.round((completedSteps / setupSteps.length) * 100);
  const stats: Array<{ label: string; value: number; helper: string; icon: IconName }> = [
    { label: "Aplicaciones", value: data.applications.length, helper: "consumidores registrados", icon: "apps" },
    { label: "Emisores", value: data.identityProviders.length, helper: "identidades RS256", icon: "shield" },
    { label: "Proveedores", value: data.providers.length, helper: "APIs conectadas", icon: "server" },
    { label: "Rutas", value: data.routes.length, helper: "operaciones permitidas", icon: "route" },
  ];
  const initial = admin.email.slice(0, 1).toUpperCase();

  return (
    <main className="app-shell">
      <div aria-hidden="true" className="ambient ambient-one" />
      <div aria-hidden="true" className="ambient ambient-two" />

      <header className="app-header">
        <Link aria-label="Ir al inicio" className="brand-lockup" href="/">
          <span className="brand-symbol"><Icon name="gateway" size={24} /></span>
          <span className="brand-copy">
            <strong>Federated</strong>
            <small>API Gateway</small>
          </span>
        </Link>

        <div className="header-actions">
          <span className="system-pill"><i />Gateway operativo</span>
          <div className="user-chip" title={admin.email}>
            <span className="avatar">{initial}</span>
            <span className="user-copy"><strong>Administrador</strong><small>{admin.email}</small></span>
          </div>
          <Link className="icon-button" href="/docs"><Icon name="docs" /><span>Docs</span></Link>
          <form action="/auth/signout" method="post">
            <button aria-label="Cerrar sesión" className="icon-button square" title="Cerrar sesión" type="submit">
              <Icon name="logout" />
            </button>
          </form>
        </div>
      </header>

      <section className="dashboard-hero">
        <div className="hero-copy">
          <div className="overline"><Icon name="sparkles" size={15} /> Control plane seguro</div>
          <h1>Conecta tus APIs.<br /><span>Conserva el control.</span></h1>
          <p>
            Una sola capa para validar identidades, proteger credenciales y entregar respuestas
            upstream intactas a cualquier aplicación.
          </p>
          <div className="hero-actions">
            <a className="button primary button-large" href="#control-plane">
              Configurar gateway <Icon name="arrow" />
            </a>
            <Link className="button ghost button-large" href="/docs"><Icon name="code" /> Ver integración</Link>
          </div>
          <div className="trust-row">
            <span><Icon name="shield" size={16} /> RS256 + JWKS</span>
            <span><Icon name="lock" size={16} /> Secretos en Vault</span>
            <span><Icon name="activity" size={16} /> Auditoría segura</span>
          </div>
        </div>

        <div className="request-card">
          <div className="request-card-header">
            <div className="window-dots"><i /><i /><i /></div>
            <span>Solicitud autenticada</span>
            <span className="live-indicator"><i /> LIVE</span>
          </div>
          <div aria-label="Flujo de una solicitud" className="request-flow" role="img">
            <div><span className="flow-icon"><Icon name="apps" /></span><small>Tu app</small></div>
            <span className="flow-line"><i /></span>
            <div><span className="flow-icon featured"><Icon name="gateway" /></span><small>Gateway</small></div>
            <span className="flow-line"><i /></span>
            <div><span className="flow-icon"><Icon name="server" /></span><small>Proveedor</small></div>
          </div>
          <div className="code-window">
            <div><span className="method">GET</span><span className="path">/api/v1/gateway/market/quotes</span></div>
            <div><span className="code-key">Authorization</span><span className="code-value">Bearer ••••••••••••</span></div>
            <div><span className="code-key">X-Gateway-Request-Id</span><span className="code-value accent">req_a83f…</span></div>
          </div>
          <div className="request-result">
            <span><Icon name="check" size={15} /> Token verificado</span>
            <strong>200 OK <small>· 142 ms</small></strong>
          </div>
        </div>
      </section>

      <section aria-label="Resumen del gateway" className="stats-grid">
        {stats.map((stat) => (
          <article className="metric-card" key={stat.label}>
            <span className="metric-icon"><Icon name={stat.icon} /></span>
            <div><small>{stat.label}</small><strong>{stat.value}</strong><p>{stat.helper}</p></div>
          </article>
        ))}
      </section>

      <section className="overview-grid">
        <article className="onboarding-card">
          <div className="card-heading">
            <div><span className="section-kicker">Puesta en marcha</span><h2>Tu gateway está al {completion}%</h2></div>
            <span className="progress-value">{completedSteps}/{setupSteps.length}</span>
          </div>
          <div aria-label={`${completion}% completado`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={completion} className="progress-track" role="progressbar">
            <span style={{ width: `${completion}%` }} />
          </div>
          <div className="setup-steps">
            {setupSteps.map((step) => (
              <span className={step.ready ? "ready" : ""} key={step.label}>
                <i>{step.ready ? <Icon name="check" size={13} /> : null}</i>{step.label}
              </span>
            ))}
          </div>
        </article>

        <article className="security-summary">
          <span className="security-illustration"><Icon name="shield" size={30} /></span>
          <div><span className="section-kicker">Postura de seguridad</span><h2>Protección por defecto</h2></div>
          <p>Las rutas no registradas se bloquean. Los secretos nunca llegan al navegador ni a los logs.</p>
          <div className="security-tags"><span>SSRF guard</span><span>Exact CORS</span><span>Rate limits</span></div>
        </article>
      </section>

      <div id="control-plane">
        <AdminConsole data={data} />
      </div>
    </main>
  );
}
