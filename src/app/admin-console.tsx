"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { Icon, type IconName } from "@/app/ui-icons";

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

const tabs: Array<{ id: Tab; label: string; description: string; icon: IconName; count?: keyof PortalData }> = [
  { id: "applications", label: "Aplicaciones", description: "Sistemas que consumirán el gateway", icon: "apps", count: "applications" },
  { id: "issuers", label: "JWT y JWKS", description: "Emisores de identidad confiables", icon: "shield", count: "identityProviders" },
  { id: "providers", label: "Proveedores", description: "APIs externas conectadas", icon: "server", count: "providers" },
  { id: "routes", label: "Rutas", description: "Operaciones upstream permitidas", icon: "route", count: "routes" },
  { id: "access", label: "Accesos", description: "Permisos entre apps y proveedores", icon: "key", count: "access" },
  { id: "origins", label: "Orígenes CORS", description: "Clientes web autorizados", icon: "globe", count: "origins" },
  { id: "credentials", label: "Credenciales", description: "Secretos cifrados en Vault", icon: "lock", count: "credentials" },
  { id: "openapi", label: "Importar OpenAPI", description: "Crea rutas desde un contrato", icon: "upload" },
  { id: "audit", label: "Auditoría", description: "Actividad reciente del gateway", icon: "activity", count: "audit" },
];

const resourceIcons: Record<string, IconName> = {
  applications: "apps",
  "identity-providers": "shield",
  providers: "server",
  routes: "route",
  access: "key",
  origins: "globe",
  credentials: "lock",
};

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
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const filteredEntities = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return entities;
    return entities.filter((entity) => JSON.stringify(entity).toLowerCase().includes(normalized));
  }, [entities, query]);

  async function toggle(entity: Entity) {
    setBusy(entity.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/resources/${resource}/${entity.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: entity.enabled === false }),
      });
      if (!response.ok) throw new Error("No se pudo actualizar el registro");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo actualizar el registro");
    } finally {
      setBusy(null);
    }
  }

  if (entities.length === 0) return <div className="empty"><span><Icon name={resourceIcons[resource] ?? "apps"} /></span><strong>Aún no hay registros</strong><p>Completa el formulario para crear el primero.</p></div>;
  return (
    <div className="list-column">
      <div className="list-toolbar">
        <div><strong>{entities.length}</strong><span>{entities.length === 1 ? " registro" : " registros"}</span></div>
        {entities.length > 3 ? (
          <label className="search-field">
            <Icon name="search" size={15} />
            <span className="sr-only">Filtrar registros</span>
            <input onChange={(event) => setQuery(event.target.value)} placeholder="Filtrar…" type="search" value={query} />
          </label>
        ) : null}
      </div>
      {error ? <div aria-live="polite" className="notice error compact-notice">{error}</div> : null}
      {filteredEntities.length === 0 ? <div className="empty small-empty"><strong>Sin coincidencias</strong><p>Prueba con otro término.</p></div> : null}
      <div className="list">
        {filteredEntities.map((entity) => (
          <article className="list-item" key={entity.id}>
            <span className="entity-icon"><Icon name={resourceIcons[resource] ?? "apps"} /></span>
            <div className="list-main">
              <strong>{String(entity.name ?? entity.label ?? entity.operation_id ?? entity.slug ?? entity.id)}</strong>
              <span>{subtitle(entity)}</span>
            </div>
            <div className="list-actions">
              <span className={`badge ${entity.enabled === false ? "off" : ""}`}>
                <i />{entity.enabled === false ? "Inactivo" : "Activo"}
              </span>
              <button
                aria-label={`${entity.enabled === false ? "Activar" : "Desactivar"} ${String(entity.name ?? entity.label ?? "registro")}`}
                className="button small subtle"
                disabled={busy === entity.id}
                onClick={() => toggle(entity)}
                type="button"
              >
                {busy === entity.id ? "Guardando…" : entity.enabled === false ? "Activar" : "Desactivar"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function useSubmit() {
  const router = useRouter();
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
      setNotice({ text: "Guardado correctamente.", error: false });
      router.refresh();
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "La operación falló", error: true });
    } finally {
      setSaving(false);
    }
  }
  return { notice, saving, submit };
}

function Notice({ value }: { value: { text: string; error: boolean } | null }) {
  return value ? <div aria-live="polite" className={`notice ${value.error ? "error" : ""}`} role={value.error ? "alert" : "status"}>{value.text}</div> : null;
}

export function AdminConsole({ data }: { data: PortalData }) {
  const [tab, setTab] = useState<Tab>("applications");
  const appOptions = useMemo(() => data.applications.filter((item) => item.enabled !== false), [data.applications]);
  const providerOptions = useMemo(() => data.providers.filter((item) => item.enabled !== false), [data.providers]);
  const activeTab = tabs.find((item) => item.id === tab) ?? tabs[0];
  const activeCount = activeTab.count ? data[activeTab.count].length : null;

  return (
    <section aria-label="Configuración del gateway" className="control-console">
      <aside className="console-sidebar">
        <div className="console-sidebar-heading">
          <span className="section-kicker">Administración</span>
          <h2>Control plane</h2>
          <p>Configura cada capa del flujo.</p>
        </div>
        <div aria-label="Secciones de configuración" aria-orientation="vertical" className="console-nav" role="tablist">
          {tabs.map((item) => {
            const count = item.count ? data[item.count].length : null;
            return (
              <button
                aria-controls={`panel-${item.id}`}
                aria-selected={tab === item.id}
                className={`console-nav-item ${tab === item.id ? "active" : ""}`}
                id={`tab-${item.id}`}
                key={item.id}
                onClick={() => setTab(item.id)}
                role="tab"
                type="button"
              >
                <span className="nav-icon"><Icon name={item.icon} /></span>
                <span><strong>{item.label}</strong><small>{item.description}</small></span>
                {count !== null ? <em>{count}</em> : <Icon className="nav-arrow" name="arrow" size={14} />}
              </button>
            );
          })}
        </div>
        <div className="console-tip"><Icon name="shield" /><div><strong>Seguro por defecto</strong><p>Todo acceso se deniega hasta que lo autorices.</p></div></div>
      </aside>

      <div className="console-main">
        <header className="console-main-header">
          <div><span className="section-kicker">Configuración</span><h2>{activeTab.label}</h2><p>{activeTab.description}</p></div>
          {activeCount !== null ? <span className="record-count"><strong>{activeCount}</strong> total</span> : null}
        </header>
        <div aria-labelledby={`tab-${tab}`} className="tab-panel" id={`panel-${tab}`} role="tabpanel">
          {tab === "applications" ? <ApplicationsTab entities={data.applications} /> : null}
          {tab === "issuers" ? <IssuersTab apps={appOptions} entities={data.identityProviders} /> : null}
          {tab === "providers" ? <ProvidersTab entities={data.providers} /> : null}
          {tab === "routes" ? <RoutesTab providers={providerOptions} entities={data.routes} /> : null}
          {tab === "access" ? <AccessTab apps={appOptions} providers={providerOptions} entities={data.access} /> : null}
          {tab === "origins" ? <OriginsTab apps={appOptions} entities={data.origins} /> : null}
          {tab === "credentials" ? <CredentialsTab apps={appOptions} providers={providerOptions} entities={data.credentials} /> : null}
          {tab === "openapi" ? <OpenApiTab providers={providerOptions} /> : null}
          {tab === "audit" ? <AuditTab entities={data.audit} /> : null}
        </div>
      </div>
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
        <label className="field"><span>Nombre</span><input autoComplete="off" name="name" placeholder="App de operaciones" required /></label>
        <label className="field"><span>Slug</span><input autoCapitalize="none" name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="operaciones-app" required spellCheck={false} /></label>
        <label className="field"><span>Descripción <em>Opcional</em></span><textarea name="description" placeholder="¿Qué sistema consumirá el gateway?" /></label>
        <label className="field"><span>Límite por minuto</span><input defaultValue="60" min="1" name="rate" type="number" /></label>
        <button className="button primary" disabled={action.saving} type="submit">{action.saving ? "Creando…" : "Crear aplicación"}</button>
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
      <label className="field"><span>Aplicación</span><select name="app" required><option value="">Seleccionar…</option>{apps.map((a) => <option key={a.id} value={a.id}>{String(a.name)}</option>)}</select></label>
      <label className="field"><span>Nombre del emisor</span><input name="name" placeholder="Identidad corporativa" required /></label>
      <label className="field"><span>Issuer exacto</span><input name="issuer" placeholder="https://auth.example.com" required spellCheck={false} type="url" /></label>
      <label className="field"><span>JWKS URI</span><input name="jwks" placeholder="https://auth.example.com/.well-known/jwks.json" required spellCheck={false} type="url" /></label>
      <label className="field"><span>Audiences <em>Separadas por coma</em></span><input name="audiences" placeholder="web-app, native-app" required spellCheck={false} /></label>
      <div className="form-row"><label className="field"><span>Claim de scopes</span><input defaultValue="scope" name="scopes" spellCheck={false} /></label><label className="field"><span>Claim de roles</span><input defaultValue="roles" name="roles" spellCheck={false} /></label></div>
      <button className="button primary" disabled={action.saving} type="submit">{action.saving ? "Registrando…" : "Registrar emisor"}</button>
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
      <div className="form-row"><label className="field"><span>Nombre</span><input name="name" placeholder="Market Data" required /></label><label className="field"><span>Slug</span><input autoCapitalize="none" name="slug" placeholder="market-data" required spellCheck={false} /></label></div>
      <label className="field"><span>Base URL</span><input name="base_url" placeholder="https://api.example.com/v1" required spellCheck={false} type="url" /></label>
      <label className="field"><span>Descripción <em>Opcional</em></span><textarea name="description" placeholder="Datos o capacidades que ofrece esta API" /></label>
      <div className="form-row"><label className="field"><span>Autenticación</span><select defaultValue="bearer_static" name="auth_type"><option value="none">Ninguna</option><option value="bearer_static">Bearer estático</option><option value="api_key_header">API key en header</option><option value="api_key_query">API key en query</option></select></label><label className="field"><span>Nombre header/query</span><input name="auth_name" placeholder="X-API-Key" spellCheck={false} /></label></div>
      <label className="field"><span>Límite por minuto</span><input defaultValue="60" min="1" name="rate" type="number" /></label>
      <button className="button primary" disabled={action.saving} type="submit">{action.saving ? "Creando…" : "Crear proveedor"}</button>
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
      <label className="field"><span>Proveedor</span><select name="provider" required><option value="">Seleccionar…</option>{providers.map((p) => <option key={p.id} value={p.id}>{String(p.name)}</option>)}</select></label>
      <div className="form-row"><label className="field"><span>Método</span><select name="method"><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select></label><label className="field"><span>Operation ID</span><input name="operation" placeholder="getQuote" required spellCheck={false} /></label></div>
      <label className="field"><span>Path template</span><input name="path" placeholder="/quotes/{symbol}" required spellCheck={false} /></label>
      <label className="field"><span>Scopes requeridos <em>Separados por coma</em></span><input name="scopes" placeholder="market:read, quotes:read" spellCheck={false} /></label>
      <label className="check-field"><input name="sse" type="checkbox" /><span><strong>Permitir streaming SSE</strong><small>La ruta podrá mantener conexiones de larga duración.</small></span></label>
      <button className="button primary" disabled={action.saving} type="submit">{action.saving ? "Creando…" : "Crear ruta"}</button>
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
      <label className="field"><span>Aplicación</span><select name="app" required><option value="">Seleccionar…</option>{apps.map((a) => <option key={a.id} value={a.id}>{String(a.name)}</option>)}</select></label>
      <label className="field"><span>Proveedor</span><select name="provider" required><option value="">Seleccionar…</option>{providers.map((p) => <option key={p.id} value={p.id}>{String(p.name)}</option>)}</select></label>
      <label className="field"><span>Límite por minuto <em>Opcional</em></span><input min="1" name="rate" placeholder="Hereda el límite general" type="number" /></label>
      <button className="button primary" disabled={action.saving} type="submit">{action.saving ? "Autorizando…" : "Autorizar acceso"}</button>
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
      <div className="vault-note"><Icon name="lock" /><span><strong>Escritura de una sola vía</strong><small>El valor no podrá recuperarse desde el portal.</small></span></div>
      <label className="field"><span>Proveedor</span><select name="provider" required><option value="">Seleccionar…</option>{providers.map((p) => <option key={p.id} value={p.id}>{String(p.name)}</option>)}</select></label>
      <label className="field"><span>Propietario</span><select onChange={(e) => setOwner(e.target.value)} value={owner}><option value="shared">Compartido</option><option value="application">Aplicación específica</option></select></label>
      {owner === "application" ? <label className="field"><span>Aplicación</span><select name="app" required><option value="">Seleccionar…</option>{apps.map((a) => <option key={a.id} value={a.id}>{String(a.name)}</option>)}</select></label> : null}
      <label className="field"><span>Etiqueta</span><input name="label" placeholder="Producción" required /></label>
      <label className="field"><span>Valor secreto</span><textarea autoComplete="new-password" name="secret" placeholder="Pega aquí la credencial" required spellCheck={false} /></label>
      <button className="button primary" disabled={action.saving} type="submit">{action.saving ? "Protegiendo…" : "Guardar de forma segura"}</button>
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
      <label className="field"><span>Aplicación</span><select name="app" required><option value="">Seleccionar…</option>{apps.map((a) => <option key={a.id} value={a.id}>{String(a.name)}</option>)}</select></label>
      <label className="field"><span>Origen exacto</span><input name="origin" placeholder="https://app.example.com" required spellCheck={false} type="url" /></label>
      <div className="form-hint"><Icon name="globe" size={16} /> Incluye protocolo y puerto cuando corresponda. No agregues paths.</div>
      <button className="button primary" disabled={action.saving} type="submit">{action.saving ? "Guardando…" : "Permitir origen"}</button>
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
      <label className="field"><span>Proveedor de destino</span><select name="provider" required><option value="">Seleccionar…</option>{providers.map((p) => <option key={p.id} value={p.id}>{String(p.name)}</option>)}</select></label>
      <label className="field"><span>Documento JSON o YAML</span><textarea className="openapi-editor" name="document" placeholder="openapi: 3.1.0\ninfo:\n  title: Example API\n  version: 1.0.0" required spellCheck={false} /></label>
      <button className="button primary" disabled={action.saving} type="submit">{action.saving ? "Analizando documento…" : "Importar operaciones"}</button>
    </form>
  </div>;
}

function AuditTab({ entities }: { entities: Entity[] }) {
  return <div className="section"><h2>Invocaciones recientes</h2><p>Metadatos de uso sin cuerpos, tokens ni secretos.</p>
    {entities.length === 0 ? <div className="empty"><span><Icon name="activity" /></span><strong>Sin actividad todavía</strong><p>Las llamadas al gateway aparecerán aquí.</p></div> : <div className="audit-grid">
      <div aria-hidden="true" className="audit-row audit-head"><span>Fecha</span><span>Solicitud</span><span>Resultado</span><span>Duración</span></div>
      {entities.map((e) => {
        const status = String(e.upstream_status ?? e.gateway_error_code ?? "—");
        const successful = Number(e.upstream_status) >= 200 && Number(e.upstream_status) < 400;
        return <div className="audit-row" key={e.id}>
          <span className="audit-date">{new Date(String(e.created_at)).toLocaleString()}</span>
          <code><em>{String(e.method)}</em>{String(e.path)}</code>
          <span className={`audit-status ${successful ? "success" : ""}`}><i />{status}</span>
          <span className="audit-duration">{String(e.duration_ms)} ms</span>
        </div>;
      })}
    </div>}
  </div>;
}
