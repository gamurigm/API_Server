"use client";

import { FormEvent, useMemo, useState } from "react";

type Entity = Record<string, unknown> & { id: string; enabled?: boolean; name?: string; slug?: string };

interface PortalData {
  applications: Entity[];
  identityProviders: Entity[];
  providers: Entity[];
  routes: Entity[];
  access: Entity[];
  credentials: Entity[];
  origins: Entity[];
  audit: Entity[];
}

type Tab = "applications" | "issuers" | "providers" | "routes" | "access" | "origins" | "credentials" | "openapi" | "audit";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "applications", label: "Apps" },
  { id: "issuers", label: "JWT / JWKS" },
  { id: "providers", label: "Proveedores" },
  { id: "routes", label: "Rutas" },
  { id: "access", label: "Accesos" },
  { id: "origins", label: "CORS" },
  { id: "credentials", label: "Secretos" },
  { id: "openapi", label: "OpenAPI" },
  { id: "audit", label: "Auditoría" },
];

function relationLabel(entity: Entity, key: string): string {
  const relation = entity[key];
  if (relation && typeof relation === "object" && !Array.isArray(relation)) {
    const record = relation as Record<string, unknown>;
    return String(record.name ?? record.slug ?? "");
  }
  return "";
}

function EntityList({
  entities,
  resource,
  subtitle,
}: {
  entities: Entity[];
  resource: string;
  subtitle: (entity: Entity) => string;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(entity: Entity) {
    setBusy(entity.id);
    await fetch(`/api/admin/resources/${resource}/${entity.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: entity.enabled === false }),
    });
    window.location.reload();
  }

  if (entities.length === 0) return <div className="empty">Aún no hay registros.</div>;
  return (
    <div className="list">
      {entities.map((entity) => (
        <div className="list-item" key={entity.id}>
          <div className="list-main">
            <strong>{String(entity.name ?? entity.label ?? entity.operation_id ?? entity.slug ?? entity.id)}</strong>
            <span>{subtitle(entity)}</span>
          </div>
          <div>
            <span className={`badge ${entity.enabled === false ? "off" : ""}`}>
              {entity.enabled === false ? "inactivo" : "activo"}
            </span>{" "}
            <button className="button small" disabled={busy === entity.id} onClick={() => toggle(entity)} type="button">
              {entity.enabled === false ? "Activar" : "Desactivar"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function useSubmit() {
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(url: string, body: unknown) {
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "La operación falló");
      setNotice({ text: "Guardado correctamente. Actualizando…", error: false });
      window.setTimeout(() => window.location.reload(), 350);
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "La operación falló", error: true });
    } finally {
      setSaving(false);
    }
  }
  return { notice, saving, submit };
}

function Notice({ value }: { value: { text: string; error: boolean } | null }) {
  return value ? <div className={`notice ${value.error ? "error" : ""}`}>{value.text}</div> : null;
}

export function AdminConsole({ data }: { data: PortalData }) {
  const [tab, setTab] = useState<Tab>("applications");
  const appOptions = useMemo(() => data.applications.filter((item) => item.enabled !== false), [data.applications]);
  const providerOptions = useMemo(() => data.providers.filter((item) => item.enabled !== false), [data.providers]);

  return (
    <section className="panel">
      <div className="tabs">
        {tabs.map((item) => (
          <button className={`tab ${tab === item.id ? "active" : ""}`} key={item.id} onClick={() => setTab(item.id)} type="button">
            {item.label}
          </button>
        ))}
      </div>
      {tab === "applications" ? <ApplicationsTab entities={data.applications} /> : null}
      {tab === "issuers" ? <IssuersTab apps={appOptions} entities={data.identityProviders} /> : null}
      {tab === "providers" ? <ProvidersTab entities={data.providers} /> : null}
      {tab === "routes" ? <RoutesTab providers={providerOptions} entities={data.routes} /> : null}
      {tab === "access" ? <AccessTab apps={appOptions} providers={providerOptions} entities={data.access} /> : null}
      {tab === "origins" ? <OriginsTab apps={appOptions} entities={data.origins} /> : null}
      {tab === "credentials" ? <CredentialsTab apps={appOptions} providers={providerOptions} entities={data.credentials} /> : null}
      {tab === "openapi" ? <OpenApiTab providers={providerOptions} /> : null}
      {tab === "audit" ? <AuditTab entities={data.audit} /> : null}
    </section>
  );
}

function ApplicationsTab({ entities }: { entities: Entity[] }) {
  const action = useSubmit();
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action.submit("/api/admin/applications", {
      name: form.get("name"), slug: form.get("slug"), description: form.get("description") || null,
      rate_limit_per_minute: Number(form.get("rate")), enabled: true,
    });
  }
  return (
    <div className="section"><h2>Aplicaciones consumidoras</h2><p>Representan sistemas existentes que emiten JWT RS256.</p><div className="split">
      <form className="form" onSubmit={onSubmit}><Notice value={action.notice} />
        <div className="field"><label>Nombre</label><input name="name" required /></div>
        <div className="field"><label>Slug</label><input name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></div>
        <div className="field"><label>Descripción</label><textarea name="description" /></div>
        <div className="field"><label>Límite por minuto</label><input defaultValue="60" min="1" name="rate" type="number" /></div>
        <button className="button primary" disabled={action.saving}>Crear aplicación</button>
      </form>
      <EntityList entities={entities} resource="applications" subtitle={(e) => `${e.slug} · ${e.rate_limit_per_minute} req/min`} />
    </div></div>
  );
}

function IssuersTab({ apps, entities }: { apps: Entity[]; entities: Entity[] }) {
  const action = useSubmit();
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await action.submit("/api/admin/identity-providers", {
      consumer_application_id: form.get("app"), name: form.get("name"), issuer: form.get("issuer"), jwks_uri: form.get("jwks"),
      audiences: String(form.get("audiences")).split(",").map((v) => v.trim()).filter(Boolean), scopes_claim: form.get("scopes") || "scope",
      roles_claim: form.get("roles") || "roles", enabled: true,
    });
  }
  return <div className="section"><h2>Emisores JWT RS256</h2><p>El gateway descarga únicamente el JWKS configurado aquí.</p><div className="split">
    <form className="form" onSubmit={onSubmit}><Notice value={action.notice} />
      <div className="field"><label>Aplicación</label><select name="app" required><option value="">Seleccionar…</option>{apps.map((a) => <option key={a.id} value={a.id}>{String(a.name)}</option>)}</select></div>
      <div className="field"><label>Nombre</label><input name="name" required /></div>
      <div className="field"><label>Issuer exacto</label><input name="issuer" placeholder="https://auth.example.com" required type="url" /></div>
      <div className="field"><label>JWKS URI</label><input name="jwks" placeholder="https://auth.example.com/.well-known/jwks.json" required type="url" /></div>
      <div className="field"><label>Audiences (separadas por coma)</label><input name="audiences" required /></div>
      <div className="form-row"><div className="field"><label>Claim de scopes</label><input defaultValue="scope" name="scopes" /></div><div className="field"><label>Claim de roles</label><input defaultValue="roles" name="roles" /></div></div>
      <button className="button primary" disabled={action.saving}>Registrar issuer</button>
    </form>
    <EntityList entities={entities} resource="identity-providers" subtitle={(e) => `${relationLabel(e, "consumer_applications")} · ${e.issuer}`} />
  </div></div>;
}

function ProvidersTab({ entities }: { entities: Entity[] }) {
  const action = useSubmit();
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const authType = String(form.get("auth_type"));
    const authConfig = authType === "api_key_header" ? { headerName: form.get("auth_name") || "X-API-Key" }
      : authType === "api_key_query" ? { queryName: form.get("auth_name") || "api_key" } : {};
    await action.submit("/api/admin/providers", {
      name: form.get("name"), slug: form.get("slug"), description: form.get("description") || null, base_url: form.get("base_url"),
      auth_type: authType, auth_config: authConfig, timeout_ms: 25000, sse_timeout_ms: 300000,
      rate_limit_per_minute: Number(form.get("rate")), enabled: true,
    });
  }
  return <div className="section"><h2>Proveedores upstream</h2><p>Solo se admiten hosts HTTPS públicos y sin redirects.</p><div className="split">
    <form className="form" onSubmit={onSubmit}><Notice value={action.notice} />
      <div className="form-row"><div className="field"><label>Nombre</label><input name="name" required /></div><div className="field"><label>Slug</label><input name="slug" required /></div></div>
      <div className="field"><label>Base URL</label><input name="base_url" placeholder="https://api.example.com/v1" required type="url" /></div>
      <div className="field"><label>Descripción</label><textarea name="description" /></div>
      <div className="form-row"><div className="field"><label>Autenticación</label><select defaultValue="bearer_static" name="auth_type"><option value="none">Ninguna</option><option value="bearer_static">Bearer estático</option><option value="api_key_header">API key en header</option><option value="api_key_query">API key en query</option></select></div><div className="field"><label>Nombre header/query</label><input name="auth_name" placeholder="X-API-Key" /></div></div>
      <div className="field"><label>Límite por minuto</label><input defaultValue="60" min="1" name="rate" type="number" /></div>
      <button className="button primary" disabled={action.saving}>Crear proveedor</button>
    </form>
    <EntityList entities={entities} resource="providers" subtitle={(e) => `${e.slug} · ${e.base_url} · ${e.auth_type}`} />
  </div></div>;
}

function RoutesTab({ providers, entities }: { providers: Entity[]; entities: Entity[] }) {
  const action = useSubmit();
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await action.submit("/api/admin/routes", {
      provider_id: form.get("provider"), method: form.get("method"), path_template: form.get("path"), operation_id: form.get("operation"),
      description: form.get("description") || null, required_scopes: String(form.get("scopes")).split(",").map((v) => v.trim()).filter(Boolean),
      allowed_request_headers: [], allowed_response_headers: [], supports_sse: form.get("sse") === "on", enabled: true, source: "manual",
    });
  }
  const providerName = (id: unknown) => String(providers.find((p) => p.id === id)?.name ?? "Proveedor");
  return <div className="section"><h2>Rutas permitidas</h2><p>Una ruta no registrada jamás será reenviada.</p><div className="split">
    <form className="form" onSubmit={onSubmit}><Notice value={action.notice} />
      <div className="field"><label>Proveedor</label><select name="provider" required><option value="">Seleccionar…</option>{providers.map((p) => <option key={p.id} value={p.id}>{String(p.name)}</option>)}</select></div>
      <div className="form-row"><div className="field"><label>Método</label><select name="method"><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select></div><div className="field"><label>Operation ID</label><input name="operation" required /></div></div>
      <div className="field"><label>Path template</label><input name="path" placeholder="/quotes/{symbol}" required /></div>
      <div className="field"><label>Scopes requeridos</label><input name="scopes" placeholder="market:read, quotes:read" /></div>
      <div className="field"><label><input name="sse" type="checkbox" /> Permitir streaming SSE</label></div>
      <button className="button primary" disabled={action.saving}>Crear ruta</button>
    </form>
    <EntityList entities={entities} resource="routes" subtitle={(e) => `${providerName(e.provider_id)} · ${e.method} ${e.path_template}`} />
  </div></div>;
}

function AccessTab({ apps, providers, entities }: { apps: Entity[]; providers: Entity[]; entities: Entity[] }) {
  const action = useSubmit();
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const rawRate = String(form.get("rate") ?? "");
    await action.submit("/api/admin/access", { consumer_application_id: form.get("app"), provider_id: form.get("provider"), enabled: true, rate_limit_per_minute: rawRate ? Number(rawRate) : null });
  }
  return <div className="section"><h2>Acceso app → proveedor</h2><p>Denegado por defecto hasta crear una regla.</p><div className="split">
    <form className="form" onSubmit={onSubmit}><Notice value={action.notice} />
      <div className="field"><label>Aplicación</label><select name="app" required><option value="">Seleccionar…</option>{apps.map((a) => <option key={a.id} value={a.id}>{String(a.name)}</option>)}</select></div>
      <div className="field"><label>Proveedor</label><select name="provider" required><option value="">Seleccionar…</option>{providers.map((p) => <option key={p.id} value={p.id}>{String(p.name)}</option>)}</select></div>
      <div className="field"><label>Límite opcional por minuto</label><input min="1" name="rate" type="number" /></div>
      <button className="button primary" disabled={action.saving}>Autorizar</button>
    </form>
    <EntityList entities={entities} resource="access" subtitle={(e) => `${relationLabel(e, "consumer_applications")} → ${relationLabel(e, "providers")}`} />
  </div></div>;
}

function CredentialsTab({ apps, providers, entities }: { apps: Entity[]; providers: Entity[]; entities: Entity[] }) {
  const action = useSubmit(); const [owner, setOwner] = useState("shared");
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await action.submit("/api/admin/credentials", { provider_id: form.get("provider"), owner_type: owner, consumer_application_id: owner === "application" ? form.get("app") : null, label: form.get("label"), secret: form.get("secret") });
  }
  return <div className="section"><h2>Secretos del proveedor</h2><p>El valor se envía directamente a Vault y no volverá a mostrarse.</p><div className="split">
    <form className="form" onSubmit={onSubmit}><Notice value={action.notice} />
      <div className="field"><label>Proveedor</label><select name="provider" required><option value="">Seleccionar…</option>{providers.map((p) => <option key={p.id} value={p.id}>{String(p.name)}</option>)}</select></div>
      <div className="field"><label>Propietario</label><select onChange={(e) => setOwner(e.target.value)} value={owner}><option value="shared">Compartido</option><option value="application">Aplicación específica</option></select></div>
      {owner === "application" ? <div className="field"><label>Aplicación</label><select name="app" required><option value="">Seleccionar…</option>{apps.map((a) => <option key={a.id} value={a.id}>{String(a.name)}</option>)}</select></div> : null}
      <div className="field"><label>Etiqueta</label><input name="label" placeholder="Producción" required /></div>
      <div className="field"><label>Valor secreto</label><textarea autoComplete="off" name="secret" required /></div>
      <button className="button primary" disabled={action.saving}>Guardar en Vault</button>
    </form>
    <EntityList entities={entities} resource="credentials" subtitle={(e) => `${relationLabel(e, "providers")} · ${e.owner_type}${relationLabel(e, "consumer_applications") ? ` · ${relationLabel(e, "consumer_applications")}` : ""}`} />
  </div></div>;
}

function OriginsTab({ apps, entities }: { apps: Entity[]; entities: Entity[] }) {
  const action = useSubmit();
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await action.submit("/api/admin/origins", { consumer_application_id: form.get("app"), origin: form.get("origin"), enabled: true });
  }
  return <div className="section"><h2>Orígenes web permitidos</h2><p>CORS usa coincidencia exacta. Las aplicaciones nativas no necesitan registrar un origen.</p><div className="split">
    <form className="form" onSubmit={onSubmit}><Notice value={action.notice} />
      <div className="field"><label>Aplicación</label><select name="app" required><option value="">Seleccionar…</option>{apps.map((a) => <option key={a.id} value={a.id}>{String(a.name)}</option>)}</select></div>
      <div className="field"><label>Origen</label><input name="origin" placeholder="https://app.example.com" required type="url" /></div>
      <button className="button primary" disabled={action.saving}>Permitir origen</button>
    </form>
    <EntityList entities={entities} resource="origins" subtitle={(e) => `${relationLabel(e, "consumer_applications")} · ${e.origin}`} />
  </div></div>;
}

function OpenApiTab({ providers }: { providers: Entity[] }) {
  const action = useSubmit();
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await action.submit("/api/admin/openapi/import", { provider_id: form.get("provider"), document: form.get("document") });
  }
  return <div className="section"><h2>Importar OpenAPI 3.x</h2><p>Se importan métodos y rutas, pero nunca se cambia automáticamente la base URL.</p>
    <form className="form" onSubmit={onSubmit}><Notice value={action.notice} />
      <div className="field"><label>Proveedor</label><select name="provider" required><option value="">Seleccionar…</option>{providers.map((p) => <option key={p.id} value={p.id}>{String(p.name)}</option>)}</select></div>
      <div className="field"><label>Documento JSON o YAML</label><textarea name="document" required style={{ minHeight: 330 }} /></div>
      <button className="button primary" disabled={action.saving}>Importar operaciones</button>
    </form>
  </div>;
}

function AuditTab({ entities }: { entities: Entity[] }) {
  return <div className="section"><h2>Invocaciones recientes</h2><p>Metadatos de uso sin cuerpos, tokens ni secretos.</p>
    {entities.length === 0 ? <div className="empty">Aún no hay invocaciones.</div> : <div className="audit-grid">{entities.map((e) => <div className="audit-row" key={e.id}>
      <span>{new Date(String(e.created_at)).toLocaleString()}</span><code>{String(e.method)} {String(e.path)}</code>
      <span>{String(e.upstream_status ?? e.gateway_error_code ?? "—")}</span><span>{String(e.duration_ms)} ms</span>
    </div>)}</div>}
  </div>;
}
