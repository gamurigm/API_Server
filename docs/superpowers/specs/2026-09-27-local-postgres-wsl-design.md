# Diseño: PostgreSQL local en WSL

## Propósito

Operar el Federated API Gateway localmente con PostgreSQL estándar ejecutándose en Ubuntu WSL. La administración se hace desde la TUI existente y requiere una sola contraseña local, sin cuentas, perfiles ni correo de operador. El proyecto Supabase alojado queda fuera del flujo y no se modifica.

## Decisiones acordadas

- Eliminar el frontend web antiguo y conservar la TUI como única interfaz de administración.
- Retirar Next.js y conservar las rutas HTTP del gateway y las capacidades administrativas actuales en un servidor Node.js con Hono.
- Ejecutar el backend HTTP y sus dependencias de Node desde Ubuntu WSL; la TUI de Windows se conecta por `localhostForwarding`.
- Usar puertos loopback configurables y no estándar: API `43871`, Vault `43872` y PostgreSQL `5434` en la instalación local aprobada. Verificar disponibilidad antes del arranque.
- Crear el comando global de Windows `gateway-tui`, que invoca la TUI con el Node y las dependencias instalados en WSL.
- Usar PostgreSQL estándar en WSL y el driver `pg` desde el backend.
- Crear una base local vacía mediante migraciones del repositorio; no copiar ni consultar datos de Supabase.
- Sustituir Supabase Auth por una contraseña local única. Guardar únicamente un hash scrypt con salt, configurado en el entorno local del backend.
- Mantener las sesiones administrativas solo en memoria del proceso y con expiración; el reinicio del backend las invalida.
- Reemplazar Supabase Vault por HashiCorp Vault local en Ubuntu WSL. PostgreSQL conserva metadatos y una ruta por credencial; los secretos upstream se guardan en un motor KV v2 persistente.
- PostgreSQL tendrá un rol de servicio técnico para la conexión. No representa una cuenta personal de aplicación.
- Mantener la autenticación de consumidores existente: claves del gateway, JWT RS256, scopes, límites de velocidad, restricciones de red y auditoría.
- La API no iniciará Vault ni PostgreSQL ni aplicará migraciones al arrancar. Se documentarán comandos explícitos para iniciar y desbloquear Vault, iniciar PostgreSQL WSL, iniciar la API y migrar el esquema.

## Arquitectura

Un servidor Hono con el adaptador oficial de Node HTTP corre en Ubuntu WSL y escucha en `127.0.0.1:43871` por defecto. `GATEWAY_HTTP_PORT` permite cambiar el puerto sin modificar código. El servidor registra las rutas del gateway, administración, sesión, salud y OpenAPI y conserva sus métodos, paths, contratos JSON, códigos de error y comportamiento CORS. `GET /` devuelve una respuesta breve que identifica al servicio e indica `/api/health`; no sirve una interfaz web. Las respuestas SSE se transmiten sin almacenamiento intermedio. Nginx no forma parte del flujo local.

Un cliente de base de datos con pool `pg` reemplaza `@supabase/supabase-js`. Los accesos de datos se agrupan en consultas SQL parametrizadas y reutilizables, incluyendo funciones transaccionales para rate limits, leases SSE, rotación de credenciales y escritura de auditoría.

El Node, npm y las dependencias de la aplicación se ejecutan dentro de Ubuntu WSL, no desde los módulos nativos de Windows. El API escucha solo en loopback. La TUI de Windows usa `gateway-tui`, un comando global instalado en el prefijo de npm del usuario que invoca `wsl.exe` para ejecutar el cliente dentro del mismo checkout. El backend se inicia por separado desde WSL; el comando de la TUI informa si no está disponible.

La TUI pide la contraseña sin mostrarla y la envía una vez al endpoint local de sesión. El backend la compara con el hash configurado usando `crypto.scrypt` y comparación de tiempo constante. Si es válida, crea un bearer aleatorio de corta duración guardado solo en memoria. Las rutas administrativas validan el bearer en el backend. La sesión no es una identidad de usuario y no persiste en disco ni en PostgreSQL.

El backend escribe y lee credenciales upstream usando la API de HashiCorp Vault. Vault corre como servicio local en WSL, con backend de almacenamiento persistente `file`, motor KV v2 montado en `secret/` y listener ligado a `127.0.0.1:43872` por defecto (`VAULT_ADDR` es configurable). No se usa modo `-dev`, porque su almacenamiento está en memoria y pierde los secretos al detenerse. Tras reiniciar WSL/Vault, el operador lo desbloquea manualmente con sus claves de unseal. La aplicación usa un token local separado con una policy de mínimos privilegios para crear, leer, actualizar y borrar secretos bajo `secret/data/gateway/*` y borrar sus metadatos bajo `secret/metadata/gateway/*`; nunca usa el token root. La dirección y el token de aplicación permanecen en el entorno local del backend y no se envían a la TUI.

Cada credencial tiene una ruta única de Vault. Al crear o reemplazar una credencial, el backend coordina las escrituras en Vault y PostgreSQL: guarda primero el secreto, actualiza los metadatos en una transacción y elimina el secreto recién creado si la transacción falla. Al retirar una credencial, elimina también sus metadatos y versiones de KV v2; si Vault no está disponible, la acción falla con un error claro y permite reintento. Los valores secretos solo se usan al construir solicitudes upstream y nunca se devuelven en listados administrativos ni se escriben en logs.

PostgreSQL corre en WSL y escucha en loopback, en el puerto local `5434` ya provisionado. La API en WSL se conecta directamente a `127.0.0.1:5434`; no necesita atravesar el reenvío Windows↔WSL. El archivo local del backend configura `DATABASE_URL`, `VAULT_ADDR`, `VAULT_TOKEN`, `ADMIN_PASSWORD_HASH` y `GATEWAY_HTTP_PORT`. La TUI conserva solo `LOCAL_API_URL=http://127.0.0.1:43871` (ajustable si se cambia el puerto). `localhostForwarding=true` permite que la TUI de Windows alcance la API de WSL.

## Datos y esquema

Las migraciones locales se guardan en `db/migrations/` y se ejecutan explícitamente con una herramienta del proyecto. El esquema conserva las entidades actuales del gateway: aplicaciones consumidoras, proveedores, rutas, reglas de acceso, orígenes permitidos, credenciales, principales externos, claves API, contadores de rate limit, leases de streams y auditoría de invocaciones.

Se elimina `profiles` y cualquier dependencia de `auth.users`, RLS, roles `anon`/`authenticated`/`service_role`, Supabase Vault, funciones de Auth y configuración del CLI Supabase. La tabla de credenciales guarda metadatos y una ruta de Vault, nunca el secreto ni su texto cifrado. Las claves API siguen almacenándose como hashes SHA-256; las claves revocadas no se pueden reactivar. UUID, arrays, JSONB, restricciones e índices parciales se conservan cuando PostgreSQL estándar los soporta.

La migración local comienza sin registros de aplicación. No se exportan tablas, credenciales ni datos desde Supabase. El directorio local Supabase y las antiguas migraciones administradas por Supabase dejan de ser parte del flujo activo del proyecto; ninguna acción de esta especificación altera el servicio remoto.

## Configuración local

El archivo de ejemplo del backend documenta al menos:

- `DATABASE_URL`: conexión al PostgreSQL de WSL.
- `ADMIN_PASSWORD_HASH`: salt y hash scrypt generados localmente, sin contraseña en texto plano.
- `VAULT_ADDR`: endpoint loopback de HashiCorp Vault.
- `VAULT_TOKEN`: token de aplicación local con acceso acotado a los secretos del gateway; nunca un token root.
- Los límites existentes del gateway.

La configuración TUI conserva solo la URL loopback del API; ya no necesita URL, clave publicable ni cliente de Supabase. Los archivos `.env.local` y `.env.tui.local` existentes son privados y no se borran automáticamente. La documentación indicará cómo reemplazar claves obsoletas sin mostrar sus valores.

## Limpieza del frontend antiguo

Se eliminan Next.js, React, el adaptador de Next, configuración y tipos de Next, además de cualquier página web, consola, login del navegador, CSS, iconos y cliente Supabase del navegador. Hono y `@hono/node-server` forman el servidor HTTP; las rutas Hono reemplazan las convenciones Route Handler de Next. `tsx` ejecuta TypeScript en el entorno local WSL. La TUI, los endpoints administrativos y los ejemplos HTTP permanecen.

## Manejo de errores y seguridad

- Configuración ausente o malformada informa el nombre de la variable, nunca su valor.
- Un error de conexión PostgreSQL devuelve una respuesta de servicio no disponible en las rutas HTTP y un mensaje accionable durante el inicio.
- Contraseña inválida, sesión ausente o sesión expirada devuelve 401 sin consultar datos administrativos.
- La API y la TUI rechazan URLs que no sean loopback por defecto.
- Consultas SQL usan parámetros; operaciones que reemplazan credenciales y actualizan metadatos son transaccionales.
- El pool y el servidor HTTP se cierran correctamente al terminar el proceso. Ninguna migración destructiva o inicialización de datos ocurre de forma implícita.
- La API, Vault y PostgreSQL se vinculan a loopback y permiten configurar puertos sin usar los puertos web predeterminados 80/443 ni el puerto API típico 3000.
- La TUI global se ejecuta con Node y dependencias de WSL; no carga módulos nativos instalados para Windows.
- La contraseña administrativa, el token de servicio Vault y las claves de unseal son secretos independientes. Los ejemplos contienen placeholders, nunca secretos.

## Fuera de alcance

- Migrar datos desde Supabase o conectarse al proyecto Supabase alojado.
- Cambiar la autenticación JWT de consumidores o el contrato público del gateway.
- Publicar o alojar remotamente la aplicación.
- Usar Nginx como proxy inverso en el flujo de escritorio local.
- Crear usuarios, perfiles, roles de operador o recuperación por correo.
- Iniciar, instalar o administrar automáticamente la distribución WSL desde el backend.

## Criterios de aceptación

- Ninguna página web antigua ni código de frontend administrativo queda en la aplicación.
- Next.js, React y su configuración se eliminan; Hono sirve la API local y la ruta `/` ya no presenta la página 404 de Next.
- La API Hono escucha en `127.0.0.1:43871` por defecto, responde salud y las rutas actuales, y mantiene SSE en streaming; el puerto se puede cambiar con configuración.
- `gateway-tui` funciona como comando global de Windows y ejecuta la TUI con Node dentro de Ubuntu WSL.
- PostgreSQL, Vault y la API usan sus puertos WSL configurados `5434`, `43872` y `43871`; la verificación de arranque informa si hay un conflicto de puerto.
- El runtime ya no depende del SDK, Auth, Supabase Vault ni la configuración/CLI de Supabase; usa HashiCorp Vault local.
- Las rutas administrativas funcionan con una única contraseña local y sesiones efímeras, sin usuario ni correo.
- El backend conecta a PostgreSQL estándar en WSL mediante un rol técnico.
- Las migraciones construyen el esquema del gateway en una base nueva y vacía, con las operaciones de rate limit y leases seguras frente a concurrencia.
- Las credenciales upstream se almacenan en Vault persistente con un token de servicio restringido y nunca aparecen en respuestas de listado o logs.
- Las capacidades actuales de administración y la autenticación/contrato de consumidores se preservan.
- La guía explica la configuración de WSL/PostgreSQL, creación del rol/base, generación del hash de contraseña, migración explícita, arranque y operación TUI.
- La guía explica la instalación/configuración de Vault con almacenamiento persistente, listener loopback, inicialización, resguardo de claves de unseal, policy/token restringido, desbloqueo tras reinicio y operación KV v2; excluye Vault `-dev`.
- Supabase alojado no recibe conexiones ni cambios durante la implementación o el flujo normal.
