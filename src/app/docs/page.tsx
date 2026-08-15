import Link from "next/link";

import { Icon } from "@/app/ui-icons";
import { requireAdminPage } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function DocsPage() {
  await requireAdminPage();

  return (
    <main className="app-shell docs-shell">
      <div aria-hidden="true" className="ambient ambient-one" />
      <header className="app-header">
        <Link aria-label="Ir al portal" className="brand-lockup" href="/">
          <span className="brand-symbol"><Icon name="gateway" size={24} /></span>
          <span className="brand-copy"><strong>Federated</strong><small>API Gateway</small></span>
        </Link>
        <Link className="button ghost" href="/"><Icon name="arrow" /> Volver al portal</Link>
      </header>

      <section className="docs-hero">
        <div>
          <div className="overline"><Icon name="docs" size={15} /> Guía de integración</div>
          <h1>Conecta cualquier cliente<br /><span>en pocos minutos.</span></h1>
          <p>Un contrato HTTP predecible, independiente del lenguaje y sin SDK obligatorio.</p>
        </div>
        <div className="docs-language-cloud" aria-label="Lenguajes compatibles">
          {[
            "curl", "JavaScript", "Python", "C++", "C#", "Java", "Go", "PowerShell",
          ].map((language) => <span key={language}>{language}</span>)}
        </div>
      </section>

      <div className="docs-layout">
        <aside className="docs-sidebar">
          <span className="section-kicker">En esta guía</span>
          <nav aria-label="Contenido de la documentación">
            <a href="#authentication"><span>01</span> Autenticación</a>
            <a href="#base-url"><span>02</span> URL base</a>
            <a href="#request"><span>03</span> Solicitud</a>
            <a href="#response"><span>04</span> Respuestas</a>
            <a href="#endpoints"><span>05</span> Endpoints</a>
          </nav>
          <div className="docs-side-note">
            <Icon name="shield" />
            <strong>Credenciales aisladas</strong>
            <p>El cliente nunca conoce la key de la API externa.</p>
          </div>
        </aside>

        <div className="docs-content">
          <article className="docs-section" id="authentication">
            <div className="step-number">01</div>
            <div className="docs-section-copy">
              <span className="section-kicker">Autenticación</span>
              <h2>Conserva el login existente</h2>
              <p>Envía el JWT RS256 que tu aplicación ya recibe. El gateway valida firma, emisor, audiencia, tiempos y scopes contra el JWKS registrado.</p>
              <div className="claim-grid">
                {[
                  ["iss", "Emisor"], ["sub", "Usuario"], ["aud", "Audiencia"],
                  ["exp", "Expiración"], ["iat", "Emisión"], ["kid", "Clave JWKS"],
                ].map(([claim, label]) => <span key={claim}><code>{claim}</code><small>{label}</small></span>)}
              </div>
            </div>
          </article>

          <article className="docs-section" id="base-url">
            <div className="step-number">02</div>
            <div className="docs-section-copy">
              <span className="section-kicker">Enrutamiento</span>
              <h2>Cambia solamente la URL base</h2>
              <p>El método, path, query y cuerpo siguen el contrato del proveedor. El slug selecciona la API configurada en el gateway.</p>
              <div className="url-comparison">
                <div><small>Antes</small><code>https://api.provider.example/v1/resources/123</code></div>
                <span><Icon name="arrow" /></span>
                <div className="highlighted"><small>Con gateway</small><code>https://gateway.example/api/v1/gateway/provider/v1/resources/123</code></div>
              </div>
            </div>
          </article>

          <article className="docs-section" id="request">
            <div className="step-number">03</div>
            <div className="docs-section-copy">
              <span className="section-kicker">Solicitud</span>
              <h2>Una llamada HTTP estándar</h2>
              <div className="code-block">
                <div className="code-block-top"><span>Terminal</span><span>curl</span></div>
                <pre><code><span className="code-command">curl</span> https://gateway.example/api/v1/gateway/provider/v1/resources/123 \{"\n"}  -H <span className="code-string">&quot;Authorization: Bearer $ACCESS_TOKEN&quot;</span> \{"\n"}  -H <span className="code-string">&quot;Accept: application/json&quot;</span></code></pre>
              </div>
              <div className="info-callout"><Icon name="lock" /><p><strong>Authorization se consume en el gateway.</strong> El JWT del usuario nunca se reenvía al proveedor externo.</p></div>
            </div>
          </article>

          <article className="docs-section" id="response">
            <div className="step-number">04</div>
            <div className="docs-section-copy">
              <span className="section-kicker">Respuesta</span>
              <h2>Transparente por diseño</h2>
              <p>Se conservan status, <code>Content-Type</code> y cuerpo del proveedor. Solo los errores originados por el gateway utilizan una envoltura propia.</p>
              <div className="response-grid">
                <div><span className="response-icon success"><Icon name="check" /></span><strong>Respuesta upstream</strong><p>Cuerpo original, sin transformaciones.</p></div>
                <div><span className="response-icon"><Icon name="activity" /></span><strong>Metadatos útiles</strong><p>Request ID y headers de cuota.</p></div>
                <div><span className="response-icon"><Icon name="code" /></span><strong>Errores consistentes</strong><p><code>error.code</code>, mensaje y request ID.</p></div>
              </div>
            </div>
          </article>

          <article className="docs-section" id="endpoints">
            <div className="step-number">05</div>
            <div className="docs-section-copy">
              <span className="section-kicker">Referencia rápida</span>
              <h2>Endpoints del gateway</h2>
              <div className="endpoint-list">
                <div><span className="method get">GET</span><code>/api/v1/providers</code><p>Catálogo autorizado para el usuario.</p></div>
                <div><span className="method any">ANY</span><code>/api/v1/gateway/:provider/:path</code><p>Proxy transparente hacia el proveedor.</p></div>
                <div><span className="method get">GET</span><code>/api/openapi</code><p>Contrato base del gateway.</p></div>
                <div><span className="method get">GET</span><code>/api/health</code><p>Estado del servicio y la base de datos.</p></div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </main>
  );
}
