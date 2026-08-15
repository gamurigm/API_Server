import { redirect } from "next/navigation";

import { Icon } from "@/app/ui-icons";

import { LoginButton } from "./login-button";

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const sensitiveParameters = [
    "email",
    "username",
    "password",
    "passwd",
    "secret",
    "token",
    "access_token",
    "refresh_token",
  ];

  if (sensitiveParameters.some((parameter) => parameter in params)) {
    redirect("/login?error=sensitive_parameters_removed");
  }

  const errorMessages: Record<string, string> = {
    local_login_not_configured: "El acceso local no está configurado.",
    local_login_failed: "No se pudo iniciar la sesión local.",
    local_login_request_rejected: "Recarga esta página y vuelve a intentar el acceso local.",
    sensitive_parameters_removed: "Se eliminaron credenciales inseguras de la URL.",
  };
  const errorCode = typeof params.error === "string" ? params.error : undefined;
  const error = errorCode
    ? errorMessages[errorCode] ?? "No se pudo iniciar sesión."
    : null;

  return (
    <main className="login-shell">
      <div aria-hidden="true" className="login-glow login-glow-one" />
      <div aria-hidden="true" className="login-glow login-glow-two" />
      <section className="login-stage">
        <div className="login-showcase">
          <div className="brand-lockup login-brand">
            <span className="brand-symbol"><Icon name="gateway" size={24} /></span>
            <span className="brand-copy"><strong>Federated</strong><small>API Gateway</small></span>
          </div>

          <div className="showcase-copy">
            <div className="overline"><Icon name="sparkles" size={15} /> Una capa. Todas tus APIs.</div>
            <h1>Seguridad invisible.<br /><span>Control absoluto.</span></h1>
            <p>Centraliza credenciales externas sin cambiar la autenticación de tus aplicaciones.</p>
          </div>

          <div aria-label="Aplicaciones conectadas mediante un gateway" className="login-network" role="img">
            <span className="network-node node-app"><Icon name="apps" /><small>Apps</small></span>
            <i className="network-line line-one" />
            <span className="network-node node-gateway"><Icon name="gateway" size={28} /><small>Gateway</small></span>
            <i className="network-line line-two" />
            <span className="network-node node-api"><Icon name="server" /><small>APIs</small></span>
            <span className="network-pulse pulse-one" /><span className="network-pulse pulse-two" />
          </div>

          <div className="showcase-features">
            <span><Icon name="shield" /> JWT RS256</span>
            <span><Icon name="lock" /> Vault cifrado</span>
            <span><Icon name="activity" /> Observabilidad</span>
          </div>
        </div>

        <section className="login-card" aria-labelledby="login-title">
          <div className="login-card-top">
            <span className="secure-chip"><i /> Acceso protegido</span>
            <span className="login-shield"><Icon name="shield" size={23} /></span>
          </div>
          <div className="login-heading">
            <span className="section-kicker">Control plane</span>
            <h2 id="login-title">Bienvenido de nuevo</h2>
            <p>Accede al espacio desde el que administras aplicaciones, rutas y credenciales.</p>
          </div>
          {error ? <div aria-live="polite" className="notice error">{error}</div> : null}
          <LoginButton />
          <div className="login-assurance">
            <Icon name="lock" size={14} />
            <span>Tu sesión administrativa está separada del tráfico de las aplicaciones.</span>
          </div>
        </section>
      </section>
    </main>
  );
}
