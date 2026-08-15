# Federated API Gateway

Gateway serverless para consumir APIs externas sin distribuir sus credenciales entre aplicaciones clientes.

Cada aplicación conserva su autenticación actual y envía un JWT RS256. El gateway valida el token contra el JWKS del emisor, comprueba permisos, obtiene la credencial del proveedor desde Supabase Vault y reenvía la solicitud. La respuesta del proveedor regresa con su status, cuerpo y `Content-Type` originales.

```text
Aplicación ── JWT RS256 ──▶ Gateway ── credencial protegida ──▶ API externa
           ◀────────────── respuesta transparente ──────────────
```

## Funcionalidades

- Confianza multi-issuer mediante RS256 y JWKS.
- Portal administrativo protegido con OAuth.
- Credenciales compartidas o específicas por aplicación en Supabase Vault.
- Catálogo de endpoints mediante OpenAPI 3.x o configuración manual.
- Proxy para `GET`, `POST`, `PUT`, `PATCH` y `DELETE`.
- Respuestas JSON y streaming SSE.
- Autorización por aplicación, proveedor y scopes del JWT.
- Rate limiting y límites de streams concurrentes.
- CORS configurable por aplicación para clientes web.
- Protecciones contra SSRF, traversal, redirects y headers inseguros.
- Auditoría sin almacenar JWT, secretos ni cuerpos de solicitudes.

## Modelo de autenticación

El proyecto separa tres responsabilidades:

1. **Administradores:** acceden al portal mediante OAuth.
2. **Aplicaciones consumidoras:** presentan sus propios JWT RS256; no comparten usuarios ni bases de datos con el gateway.
3. **APIs externas:** reciben la API key, token o credencial que el gateway recupera desde Vault.

Las aplicaciones pueden estar en servidores, equipos locales, scripts o aplicaciones móviles y estar escritas en cualquier lenguaje capaz de realizar solicitudes HTTPS.

## Arquitectura

- **Next.js:** portal y Route Handlers que forman el backend del gateway.
- **Supabase Auth:** sesión OAuth de los administradores.
- **PostgreSQL:** catálogo, políticas de acceso, cuotas y auditoría.
- **Supabase Vault:** almacenamiento cifrado de credenciales upstream.
- **Vercel o Node.js:** ejecución del backend serverless.

Este repositorio no es una aplicación estática. Las rutas bajo `src/app/api` procesan las solicitudes, autentican al consumidor y llaman a los proveedores externos desde el servidor.

## Requisitos

- Node.js 22 o posterior.
- npm.
- Supabase CLI y un runtime compatible con Docker para desarrollo local.
- Un proyecto Supabase y un proveedor OAuth para producción.
- Aplicaciones consumidoras que emitan JWT RS256 con `iss`, `sub`, `aud`, `exp`, `iat` y `kid`.
- Un endpoint JWKS accesible por HTTPS para cada emisor de producción.

## Inicio rápido

```bash
npm ci
cp .env.example .env.local
npx supabase start
npx supabase db reset
npm run dev
```

En PowerShell, use `Copy-Item .env.example .env.local`. Sustituya todos los placeholders antes de iniciar la aplicación y no versione `.env.local`.

Abra `http://localhost:3000` para acceder al portal.

## Prueba integral local

El repositorio incluye un issuer RS256 y una API externa simulados. Para usarlos:

1. Configure `.env.local` con las credenciales entregadas por `npx supabase status`.
2. Use `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3006`.
3. Habilite únicamente para esta prueba:

```dotenv
GATEWAY_ALLOW_LOCAL_TEST_HOSTS=true
NEXT_PUBLIC_ENABLE_LOCAL_ADMIN_LOGIN=true
```

4. Defina valores locales no reutilizados para `LOCAL_ADMIN_PASSWORD` y `LOCAL_PROVIDER_SECRET`.
5. Prepare los datos y ejecute los dos procesos:

```bash
npm run local:setup
npm run dev:fixture
npm run dev:local
```

6. Desde otra terminal, verifique el recorrido completo:

```bash
npm run local:test
```

El acceso administrativo local aparece en `http://127.0.0.1:3006/login`. Solo funciona en desarrollo y loopback; la contraseña permanece en el servidor y nunca se agrega al formulario, la URL o las cookies.

## Variables de entorno

| Variable | Uso |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave pública utilizada por Supabase Auth. |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave secreta exclusiva del backend. |
| `NEXT_PUBLIC_APP_URL` | Origen público del portal y callbacks. |
| `ADMIN_EMAILS` | Correos autorizados para administrar el gateway. |
| `GATEWAY_RATE_LIMIT_PER_MINUTE` | Límite operativo global por minuto. |
| `GATEWAY_JSON_LIMIT_BYTES` | Tamaño máximo de cuerpos JSON. |
| `GATEWAY_JWKS_CACHE_MS` | Duración de la caché JWKS. |

Consulte [.env.example](.env.example) para ver todos los valores admitidos. Las variables `LOCAL_*` y los flags de hosts locales son exclusivos de desarrollo.

## Configuración inicial

1. Aplique las migraciones con `npx supabase db push`.
2. Habilite el proveedor OAuth administrativo en Supabase Auth.
3. Configure `ADMIN_EMAILS` con las cuentas autorizadas.
4. Acceda al portal y cree una aplicación consumidora.
5. Registre su issuer, JWKS y audiences.
6. Cree un proveedor externo y sus rutas permitidas.
7. Autorice la relación entre la aplicación y el proveedor.
8. Guarde la credencial en Vault.
9. Registre los orígenes CORS si el consumidor se ejecuta en un navegador.

## Consumo desde una aplicación

```http
GET https://gateway.example/api/v1/gateway/example-api/v1/resources/123
Authorization: Bearer EXISTING_RS256_JWT
Accept: application/json
```

La aplicación cambia la URL base del proveedor por la del gateway y conserva el método, path, query y cuerpo esperados por la API externa. Nunca recibe la credencial upstream.

El gateway añade `X-Gateway-Request-Id` y headers de cuota. Los errores generados por el propio gateway usan este formato:

```json
{
  "error": {
    "code": "invalid_token",
    "message": "The JWT signature or claims are invalid",
    "requestId": "example-request-id"
  }
}
```

Hay ejemplos para curl, Python, JavaScript, C++, C#, Java, Go y PowerShell en [docs/client-examples.md](docs/client-examples.md).

## Seguridad

- Nunca versione `.env`, `.env.local`, tokens, certificados privados o exports de Vault.
- Mantenga `SUPABASE_SERVICE_ROLE_KEY` únicamente en el backend.
- Use proyectos y secretos diferentes para desarrollo, preview y producción.
- Registre bases URL y rutas explícitas; no permita destinos arbitrarios enviados por el cliente.
- Use HTTPS para el gateway, JWKS y proveedores en producción.
- Rote cualquier credencial que haya aparecido en una URL, log o commit.
- Mantenga deshabilitados los flags de pruebas locales en producción.

Antes de publicar o desplegar, ejecute:

```bash
npm run check
npm audit --omit=dev
```

CI repite el análisis de secretos, lint, typecheck, pruebas y build en cada push y pull request.

## Despliegue

1. Cree un proyecto Supabase para el entorno.
2. Aplique las migraciones y configure OAuth.
3. Importe el repositorio en Vercel o despliegue Next.js en un runtime Node.js compatible.
4. Configure las variables como secretos del proveedor de hosting.
5. Registre el dominio final en los callbacks de Supabase.
6. Compruebe `GET /api/health` y pruebe primero con credenciales no productivas.

El gateway utiliza Node.js runtime para verificación criptográfica, resolución DNS y streaming.

## Estructura del proyecto

```text
src/app/api/        Route Handlers administrativos y del gateway
src/lib/            autenticación, autorización, proxy y seguridad de red
supabase/migrations esquema, RLS y funciones de Vault
scripts/            fixture RS256, preparación y pruebas locales
docs/               ejemplos de integración
```

## Límites actuales

- Solo JWT RS256; no se admite HS256.
- Sin WebSocket, multipart, subida de archivos ni redirects upstream.
- Sin scraping ni integraciones con proveedores que no autoricen el uso automatizado.
- Sin IP de salida fija en plataformas serverless estándar.
- Para colas, workers o tráfico sostenido muy alto, el plano de datos puede trasladarse posteriormente a un servicio dedicado.
