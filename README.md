# Federated API Gateway

Gateway HTTP local para consumir APIs externas con claves del gateway o JWT RS256. La administración se hace desde una TUI con una sola contraseña local, sin cuentas ni correo. PostgreSQL y HashiCorp Vault corren en Ubuntu WSL. El proyecto Supabase anterior no se modifica.

## Preparación

Requiere Node.js 22+, npm, WSL Ubuntu, PostgreSQL y Vault. El servidor HTTP usa Hono directamente y se ejecuta en WSL, enlazado a `127.0.0.1:43871`; PostgreSQL escucha en `5434` y Vault en `127.0.0.1:43872`. Consulta `pg_lsclusters` en WSL si cambia el puerto. La base local `api_gateway_local` comienza vacía. La raíz HTTP devuelve JSON; no hay interfaz web activa.

1. Crea `.env.local` a partir de [.env.example](.env.example) y `.env.tui.local` a partir de [.env.tui.example](.env.tui.example). Ambos son privados e ignorados por Git. El TUI solo necesita `LOCAL_API_URL=http://127.0.0.1:43871`.
2. Para un clúster PostgreSQL nuevo, crea el rol técnico y la base desde Ubuntu WSL. `createuser --pwprompt` solicita la contraseña sin incluirla en el comando:

   ```sh
   sudo -u postgres createuser --pwprompt api_gateway_app
   sudo -u postgres createdb --owner=api_gateway_app api_gateway_local
   ```

   Limita `pg_hba.conf` a ese rol y base por TCP. Usa `sudo -u postgres psql -Atc 'SHOW hba_file;'` para encontrar el archivo. Conserva `local all postgres peer`; elimina las reglas generales `local all all peer` y `host all all` para loopback, y agrega estas reglas antes de las reglas de replicación:

   ```conf
   host api_gateway_local api_gateway_app 127.0.0.1/32 scram-sha-256
   host api_gateway_local api_gateway_app ::1/128 scram-sha-256
   ```

   Recarga el clúster con `sudo pg_ctlcluster <versión> <cluster> reload` después de editarlo. En `.env.local`, configura `DATABASE_URL` con la contraseña del rol y `VAULT_TOKEN` con el token de aplicación de política limitada. La política `gateway-credentials` permite administrar solo las credenciales upstream. Ejecuta `npm run admin:password`: solicita la contraseña dos veces sin mostrarla e imprime una línea `ADMIN_PASSWORD_HASH=...`; copia esa línea a `.env.local`. El hash scrypt queda en el entorno privado del backend, nunca en Vault. Para restablecerla, repite el comando y reemplaza la línea del hash; reinicia el backend para que cargue el nuevo valor.
3. En Ubuntu WSL, desde la carpeta del checkout, instala las dependencias Linux y aplica las migraciones a la base local:

   ```sh
   npm ci
   npm run db:migrate
   ```

4. Inicia el backend desde Ubuntu WSL:

   ```sh
   npm run dev:local
   ```

5. En PowerShell de Windows, enlaza el lanzador global una vez y abre la TUI:

   ```powershell
   npm link
   gateway-tui
   ```

`gateway-tui` inicia la TUI dentro de Ubuntu WSL desde cualquier directorio. Para ejecutarla desde Ubuntu directamente, usa `npm run tui`. No inicies el backend con Node de Windows: sus dependencias nativas se instalan y ejecutan en WSL.

Ejecuta también `npm run vault:cleanup`, `npm run vault:recover -- <credential-id>` y cualquier otro comando `npm run` que opere PostgreSQL, Vault o el backend desde Ubuntu WSL y la carpeta del checkout.

El TUI pide únicamente la contraseña local. Su sesión queda en memoria y se pierde al reiniciar el backend o al cerrar sesión. El backend solo acepta conexiones en loopback y carga el hash de administración desde `.env.local` al iniciar.

## Vault en WSL

La configuración de referencia está en [ops/vault.hcl.example](ops/vault.hcl.example), la política mínima en [ops/gateway-vault-policy.hcl](ops/gateway-vault-policy.hcl) y el temporizador de renovación en `ops/gateway-vault-renew.*`. El servicio usa almacenamiento persistente en `/opt/vault/data`, escucha en `127.0.0.1:43872` y requiere desbloqueo manual tras reiniciar WSL. En la instalación local actual, el material de recuperación está en `/root/api-gateway-vault-init.json` dentro de Ubuntu, y el token de aplicación en `/root/api-gateway-vault-app-token.json`, ambos con permisos `600`. Conserva una copia privada y segura del material de recuperación: si se pierde, no podrás recuperar los secretos de Vault.

Para desbloquear tras reiniciar WSL, ejecuta desde Ubuntu como root, sin imprimir la clave:

```sh
export VAULT_ADDR=http://127.0.0.1:43872
vault operator unseal "$(jq -r '.unseal_keys_b64[0]' /root/api-gateway-vault-init.json)" >/dev/null
```

El token del backend tiene vigencia renovable de 24 horas. `gateway-vault-renew.timer` lo renueva cada seis horas cuando Vault está desbloqueado. Revisa `systemctl status vault gateway-vault-renew.timer` si una credencial deja de resolverse. Las credenciales retiradas y las compensaciones pendientes se procesan con `npm run vault:cleanup`. Si la base de datos no está disponible cuando falla la compensación, el log muestra el ID de la credencial; recupera ese secreto con `npm run vault:recover -- <credential-id>` después de restablecer Vault.

## Uso y seguridad

Desde el TUI registra aplicaciones consumidoras, proveedores, rutas, accesos, orígenes y credenciales. Puedes retirar una credencial de forma permanente; si Vault está inaccesible, queda inactiva y `npm run vault:cleanup` reintenta el borrado desde WSL. Una clave de acceso completa aparece solo al crearla; su hash se almacena en PostgreSQL y la revocación es permanente. Las credenciales upstream viven en Vault y nunca se devuelven en los listados administrativos.

Los ejemplos de consumidores están en [docs/client-examples.md](docs/client-examples.md). El endpoint de proxy es `http://127.0.0.1:43871/api/v1/gateway/{provider}/{path}`. Los consumidores deben estar en el mismo equipo y enviar `Authorization: Bearer <clave-del-gateway-o-JWT-RS256>`. No distribuyas claves en frontends ni aplicaciones móviles.

Variables del backend: `DATABASE_URL`, `VAULT_ADDR`, `VAULT_TOKEN`, `ADMIN_PASSWORD_HASH` y, opcionalmente, `GATEWAY_RATE_LIMIT_PER_MINUTE`, `GATEWAY_JSON_LIMIT_BYTES`, `GATEWAY_JWKS_CACHE_MS`. El TUI solo usa `LOCAL_API_URL`. Mantén los archivos `.env*.local` fuera de Git.

Comprobaciones disponibles:

```sh
npm run security:check
npm run lint
npm run typecheck
npm test
npm run build
```

`src/server/` inicia Hono y `src/http/routes/` contiene las rutas HTTP activas. `src/tui/` contiene la interfaz de terminal, `src/lib/db/` las consultas y `db/migrations/` el esquema PostgreSQL. El gateway admite `GET`, `POST`, `PUT`, `PATCH`, `DELETE` y SSE; no admite WebSocket, multipart ni redirects upstream.
