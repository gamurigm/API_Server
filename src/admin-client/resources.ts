export type AdminAreaId =
  | "applications"
  | "identity-providers"
  | "providers"
  | "routes"
  | "access"
  | "origins"
  | "credentials"
  | "api-keys"
  | "openapi"
  | "audit";

export interface AdminRow extends Record<string, unknown> {
  id: string;
  enabled?: boolean;
}

export type FieldKind = "text" | "number" | "boolean" | "choice" | "csv" | "json" | "secret" | "multiline";

export interface AdminField {
  key: string;
  label: string;
  kind: FieldKind;
  optional?: boolean;
  nullable?: boolean;
  defaultValue?: unknown;
  choices?: readonly string[];
  relation?: AdminAreaId;
  hint?: string;
}

export interface AdminRelation {
  label: string;
  area: AdminAreaId;
  field: string;
  matchField: string;
  reverse?: boolean;
}

export interface AdminArea {
  id: AdminAreaId;
  label: string;
  endpoint: string;
  columns: readonly string[];
  fields?: readonly AdminField[];
  editFields?: readonly AdminField[];
  readOnly?: boolean;
  delete?: boolean;
  revoke?: boolean;
  import?: boolean;
  audit?: boolean;
  relations?: readonly AdminRelation[];
}

const appField: AdminField = { key: "consumer_application_id", label: "Aplicación", kind: "choice", relation: "applications" };
const providerField: AdminField = { key: "provider_id", label: "Proveedor", kind: "choice", relation: "providers" };
const text = (key: string, label: string, optional = false, defaultValue?: string, nullable = false): AdminField => ({ key, label, kind: "text", optional, nullable, defaultValue });
const number = (key: string, label: string, defaultValue?: number, optional = false, nullable = false): AdminField => ({ key, label, kind: "number", defaultValue, optional, nullable });
const bool = (key: string, label: string, defaultValue = true): AdminField => ({ key, label, kind: "boolean", defaultValue });
const csv = (key: string, label: string, optional = false): AdminField => ({ key, label, kind: "csv", optional });
const choice = (key: string, label: string, choices: readonly string[], defaultValue?: string): AdminField => ({ key, label, kind: "choice", choices, defaultValue });

export const ADMIN_AREAS: readonly AdminArea[] = [
  {
    id: "applications", label: "Aplicaciones consumidoras", endpoint: "/api/admin/applications",
    columns: ["name", "slug", "rate_limit_per_minute", "enabled"],
    fields: [text("name", "Nombre"), text("slug", "Slug"), text("description", "Descripción", true, undefined, true), number("rate_limit_per_minute", "Límite por minuto", 60), bool("enabled", "Activa")],
    editFields: [text("name", "Nombre"), text("slug", "Slug"), text("description", "Descripción", true, undefined, true), number("rate_limit_per_minute", "Límite por minuto", undefined, true), bool("enabled", "Activa")],
    relations: [
      { label: "Emisores JWT", area: "identity-providers", field: "id", matchField: "consumer_application_id", reverse: true },
      { label: "Accesos", area: "access", field: "id", matchField: "consumer_application_id", reverse: true },
      { label: "Orígenes CORS", area: "origins", field: "id", matchField: "consumer_application_id", reverse: true },
      { label: "Claves", area: "api-keys", field: "id", matchField: "consumer_application_id", reverse: true },
    ],
  },
  {
    id: "identity-providers", label: "Emisores JWT / JWKS", endpoint: "/api/admin/identity-providers",
    columns: ["name", "issuer", "jwks_uri", "audiences", "enabled"], delete: true,
    fields: [appField, text("name", "Nombre"), text("issuer", "Issuer HTTPS"), text("jwks_uri", "JWKS URL HTTPS"), csv("audiences", "Audiences"), text("scopes_claim", "Claim scopes", false, "scope"), text("roles_claim", "Claim roles", false, "roles"), bool("enabled", "Activo")],
    editFields: [appField, text("name", "Nombre"), text("issuer", "Issuer HTTPS"), text("jwks_uri", "JWKS URL HTTPS"), csv("audiences", "Audiences"), text("scopes_claim", "Claim scopes"), text("roles_claim", "Claim roles"), bool("enabled", "Activo")],
    relations: [{ label: "Aplicación", area: "applications", field: "consumer_application_id", matchField: "id" }],
  },
  {
    id: "providers", label: "Proveedores upstream", endpoint: "/api/admin/providers",
    columns: ["name", "slug", "base_url", "auth_type", "rate_limit_per_minute", "enabled"],
    fields: [text("name", "Nombre"), text("slug", "Slug"), text("description", "Descripción", true, undefined, true), text("base_url", "Base URL HTTPS"), choice("auth_type", "Autenticación", ["none", "bearer_static", "api_key_header", "api_key_query"]), { key: "auth_config", label: "Configuración de autenticación (JSON)", kind: "json", defaultValue: {} }, number("timeout_ms", "Timeout ms", 25000), number("sse_timeout_ms", "Timeout SSE ms", 300000), number("rate_limit_per_minute", "Límite por minuto", 60), bool("enabled", "Activo")],
    editFields: [text("name", "Nombre"), text("slug", "Slug"), text("description", "Descripción", true, undefined, true), text("base_url", "Base URL HTTPS"), choice("auth_type", "Autenticación", ["none", "bearer_static", "api_key_header", "api_key_query"]), { key: "auth_config", label: "Configuración de autenticación (JSON)", kind: "json" }, number("timeout_ms", "Timeout ms"), number("sse_timeout_ms", "Timeout SSE ms"), number("rate_limit_per_minute", "Límite por minuto"), bool("enabled", "Activo")],
    relations: [
      { label: "Rutas", area: "routes", field: "id", matchField: "provider_id", reverse: true },
      { label: "Accesos", area: "access", field: "id", matchField: "provider_id", reverse: true },
      { label: "Credenciales", area: "credentials", field: "id", matchField: "provider_id", reverse: true },
    ],
  },
  {
    id: "routes", label: "Rutas permitidas", endpoint: "/api/admin/routes",
    columns: ["method", "path_template", "operation_id", "required_scopes", "supports_sse", "enabled"], delete: true,
    fields: [providerField, choice("method", "Método HTTP", ["GET", "POST", "PUT", "PATCH", "DELETE"]), text("path_template", "Path template"), text("operation_id", "Operation ID"), text("description", "Descripción", true), csv("required_scopes", "Scopes requeridos", true), csv("allowed_request_headers", "Headers de solicitud", true), csv("allowed_response_headers", "Headers de respuesta", true), bool("supports_sse", "Soporta SSE", false), bool("enabled", "Activa")],
    editFields: [providerField, choice("method", "Método HTTP", ["GET", "POST", "PUT", "PATCH", "DELETE"]), text("path_template", "Path template"), text("operation_id", "Operation ID"), text("description", "Descripción", true), csv("required_scopes", "Scopes requeridos", true), csv("allowed_request_headers", "Headers de solicitud", true), csv("allowed_response_headers", "Headers de respuesta", true), bool("supports_sse", "Soporta SSE"), bool("enabled", "Activa")],
    relations: [{ label: "Proveedor", area: "providers", field: "provider_id", matchField: "id" }],
  },
  {
    id: "access", label: "Accesos aplicación → proveedor", endpoint: "/api/admin/access",
    columns: ["consumer_application_id", "provider_id", "rate_limit_per_minute", "enabled"], delete: true,
    fields: [appField, providerField, number("rate_limit_per_minute", "Límite por minuto (vacío hereda)", undefined, true, true), bool("enabled", "Activo")],
    editFields: [appField, providerField, number("rate_limit_per_minute", "Límite por minuto (vacío hereda)", undefined, true, true), bool("enabled", "Activo")],
    relations: [
      { label: "Aplicación", area: "applications", field: "consumer_application_id", matchField: "id" },
      { label: "Proveedor", area: "providers", field: "provider_id", matchField: "id" },
    ],
  },
  {
    id: "origins", label: "Orígenes CORS", endpoint: "/api/admin/origins",
    columns: ["consumer_application_id", "origin", "enabled"], delete: true,
    fields: [appField, text("origin", "Origen exacto"), bool("enabled", "Activo")],
    editFields: [appField, text("origin", "Origen exacto"), bool("enabled", "Activo")],
    relations: [{ label: "Aplicación", area: "applications", field: "consumer_application_id", matchField: "id" }],
  },
  {
    id: "credentials", label: "Credenciales upstream en Vault", endpoint: "/api/admin/credentials",
    columns: ["label", "provider_id", "owner_type", "consumer_application_id", "enabled", "created_at"], delete: true,
    fields: [providerField, choice("owner_type", "Alcance", ["shared", "application"]), { ...appField, optional: true }, text("label", "Etiqueta"), { key: "secret", label: "Secreto (entrada oculta)", kind: "secret" }],
    relations: [
      { label: "Proveedor", area: "providers", field: "provider_id", matchField: "id" },
      { label: "Aplicación", area: "applications", field: "consumer_application_id", matchField: "id" },
    ],
  },
  {
    id: "api-keys", label: "Claves de acceso de aplicaciones", endpoint: "/api/admin/api-keys",
    columns: ["label", "key_prefix", "consumer_application_id", "scopes", "expires_at", "revoked_at"], revoke: true,
    fields: [appField, text("label", "Nombre descriptivo"), csv("scopes", "Scopes", true), text("expires_at", "Expira (ISO 8601, vacío nunca)", true, undefined, true)],
    relations: [{ label: "Aplicación", area: "applications", field: "consumer_application_id", matchField: "id" }],
  },
  {
    id: "openapi", label: "Importar contrato OpenAPI", endpoint: "/api/admin/openapi/import",
    columns: [], import: true,
    fields: [providerField, { key: "document", label: "Contrato OpenAPI 3.x (Ctrl+S para importar)", kind: "multiline" }],
  },
  {
    id: "audit", label: "Auditoría de invocaciones", endpoint: "/api/admin/audit",
    columns: ["created_at", "consumer_application_id", "provider_id", "method", "path", "status_code", "duration_ms"], readOnly: true, audit: true,
    relations: [
      { label: "Aplicación", area: "applications", field: "consumer_application_id", matchField: "id" },
      { label: "Proveedor", area: "providers", field: "provider_id", matchField: "id" },
      { label: "Ruta", area: "routes", field: "provider_route_id", matchField: "id" },
    ],
  },
];

export const ADMIN_AREA_BY_ID = Object.fromEntries(ADMIN_AREAS.map((area) => [area.id, area])) as Record<AdminAreaId, AdminArea>;

export function areaTitle(area: AdminArea, row?: AdminRow): string {
  if (!row) return area.label;
  return String(row.name ?? row.label ?? row.operation_id ?? row.origin ?? row.path_template ?? row.id);
}

export function filteredRelationRows(rows: AdminRow[], relation: AdminRelation, source: AdminRow): AdminRow[] {
  const id = source[relation.field];
  if (typeof id !== "string") return [];
  return relation.reverse ? rows.filter((row) => row[relation.matchField] === id) : rows.filter((row) => row.id === id);
}
