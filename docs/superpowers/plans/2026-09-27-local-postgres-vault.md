# Local PostgreSQL and HashiCorp Vault Implementation Plan

> **Plan status:** The approved architecture is documented in `docs/superpowers/specs/2026-09-27-local-postgres-wsl-design.md`: Hono owns HTTP routes under `src/http/routes/`, the API listens on `127.0.0.1:43871`, Vault on `127.0.0.1:43872`, and Windows launches the TUI with `gateway-tui`. Check implementation and verification steps as evidence is recorded. Keep scoped review and commit steps open until they are actually done.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the gateway against PostgreSQL and HashiCorp Vault in Ubuntu WSL, administer it through the existing TUI with one local password, and remove obsolete browser and Supabase code.

**Architecture:** Hono serves the current consumer HTTP contract and administrative routes. PostgreSQL uses a pool and focused repositories; provider secrets live in persistent local Vault KV v2. The TUI uses short-lived in-memory admin bearer sessions after password verification.

**Tech Stack:** Hono, TypeScript 6, Node.js 22+, `pg`, PostgreSQL in Ubuntu WSL, HashiCorp Vault KV v2, Inquirer 12.10.0.

**Spec:** `docs/superpowers/specs/2026-09-27-local-postgres-wsl-design.md`

## Global Constraints

- Bind the backend and Vault API to loopback. The backend default is `127.0.0.1:43871`; Vault uses `127.0.0.1:43872`.
- Start with a new empty local database. Never connect to or modify the hosted Supabase project.
- Keep the existing gateway API keys, RS256 JWTs, scopes, rate limits, leases, network protections, audit behavior, and HTTP response contract.
- Use one admin password without operator accounts, profiles, email, or persistent admin sessions.
- Vault uses a persistent `file` backend and KV v2 at `secret/`; never use `vault server -dev` for real credentials.
- Keep database credentials, `VAULT_TOKEN`, admin password hash, Vault unseal material, and upstream secrets out of Git, the TUI child environment, HTTP listings, and logs.
- Preserve the existing uncommitted changes. Do not stage or commit; do not remove or rewrite private `.env*.local` files without inspecting their variable names safely.
- Use Hono route modules under `src/http/routes/`; do not retain Next.js configuration or Route Handler copies.
- Verify credential deletion only with synthetic records. Never use real upstream credentials in tests.

## Review Focus

- An absent, malformed, expired, or revoked admin bearer must return 401 before any administrative database access; Task 4 checks every guard path.
- A revoked or expired gateway API key must remain unusable on the next request, while only its hash is stored; Tasks 1 and 2 inspect the SQL and authentication path.
- A sealed/unavailable Vault or missing secret must fail a protected upstream request without sending it; Task 3 reviews the gateway failure path.
- Parallel rate-limit or SSE lease requests must not exceed the configured limit; Tasks 1 and 2 inspect transaction/locking semantics.
- A non-loopback TUI or Vault URL must be rejected before credentials/tokens are sent; Tasks 3 and 4 review URL parsing and request construction.

---

### Task 1: Local PostgreSQL schema and connection

**Files:**
- Create: `db/migrations/001_gateway.sql`
- Create: `scripts/db-migrate.mjs`
- Create: `src/lib/db/pool.ts`
- Modify: `src/lib/env.ts`, `package.json`, `package-lock.json`, `.env.example`

**Interfaces:**
- `getDbPool(): Pool` returns one server-only `pg` pool configured from `DATABASE_URL`.
- `withDbTransaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T>` commits on success and rolls back on error.
- `npm run db:migrate` applies numbered SQL migrations explicitly and records applied versions; app startup never migrates.
- Schema keeps the current gateway tables and constraints, replaces `credentials.vault_secret_id` with a unique `vault_path`, and omits `profiles`, `auth.users`, RLS, Supabase roles, and Supabase Vault.

- [x] **Step 1:** Compare the original gateway schema and API-key migration with the local schema; confirm PostgreSQL-specific constraints and indexes are preserved.
- [x] **Step 2:** Add `pg` and its TypeScript types, `DATABASE_URL` validation, the pool/transaction helpers, and an explicit migration command. Keep build independent of a live database.
- [x] **Step 3:** Write the initial SQL migration with UUID generation, foreign keys, unique/partial indexes, update triggers, API-key revocation protection, atomic `consume_rate_limit`, and advisory-locked stream lease functions; omit Supabase-specific grants and functions.
- [x] **Step 4:** Review the SQL for revoked-key and concurrency invariants. Run `npm run typecheck` and `npm test`; inspect their exit status.
- [x] **Step 5:** Review this task's scoped diff. Keep the working tree unstaged and uncommitted unless integration is requested.

### Task 2: Consumer gateway database access

**Files:**
- Create: `src/lib/db/consumer.ts`
- Modify: `src/lib/gateway-store.ts`, `src/lib/jwt.ts`, `src/lib/api-keys.ts`, `src/lib/cors.ts`
- Modify: `src/http/routes/v1/providers/route.ts`, `src/http/routes/health/route.ts`

**Interfaces:**
- `src/lib/db/consumer.ts` exports query functions for application/provider/route/access/origin/identity-provider lookup, API-key lookup, principal upsert, invocation insert, rate-limit consumption, and SSE lease acquisition/release.
- Existing exported functions in `gateway-store.ts`, `jwt.ts`, and `api-keys.ts` keep their signatures and error codes so consumer routes do not change contract.
- `resolveProviderSecret(context)` remains exported from `gateway-store.ts`; Task 3 replaces its implementation.

- [x] **Step 1:** Replace Supabase `.from()`/`.rpc()` calls in the listed consumer paths with parameterized PostgreSQL queries through Task 1's pool.
- [x] **Step 2:** Preserve the exact enabled/scopes/issuer/audience checks, immediate API-key revocation, gateway error envelope, audit fields, and rate-limit/lease behavior.
- [x] **Step 3:** Review a revoked/expired key path and the concurrent rate-limit/lease SQL by inspection. Run `npm run lint` and `npm run typecheck` and record any remaining references that belong to later tasks.
- [x] **Step 4:** Review this task's scoped diff. Keep the working tree unstaged and uncommitted unless integration is requested.

### Task 3: Local HashiCorp Vault credential store

**Files:**
- Create: `src/lib/vault.ts`, `src/lib/db/credentials.ts`, `src/lib/db/credentials.test.ts`, `scripts/vault-cleanup.mjs`, `scripts/vault-cleanup.test.ts`
- Create: `db/migrations/003_credential_delete_requests.sql`, `db/migrations/004_vault_cleanup_queue.sql`
- Create: `scripts/vault-recover.mjs`, `scripts/vault-recovery.mjs`
- Modify: `src/lib/env.ts`, `src/lib/gateway-store.ts`, `src/http/routes/admin/credentials/route.ts`, `src/http/routes/admin/resources/[resource]/[id]/route.ts`, `src/server/app.ts`, `src/tui/screens/credentials.ts`, `src/types/gateway.ts`, `.env.example`

**Interfaces:**
- `writeGatewaySecret(id: string, secret: string): Promise<string>` writes KV v2 at `gateway/credentials/<id>` and returns that relative path.
- `readGatewaySecret(path: string): Promise<string>` reads only validated `gateway/credentials/<uuid>` paths.
- `deleteGatewaySecret(path: string): Promise<void>` deletes KV v2 metadata and all versions for that path.
- `createCredential(input: CredentialInput): Promise<string>` writes Vault first, then atomically disables the previous active credential and inserts metadata. On SQL failure it deletes the new Vault entry; if that compensation also fails, it queues the path durably or logs the credential ID for `vault:recover`.
- `npm run vault:cleanup` accepts only a loopback PostgreSQL target, retries inactive and queued Vault paths, and records success in PostgreSQL; no active credential path is eligible.

- [x] **Step 1:** Validate `VAULT_ADDR` as a loopback URL and `VAULT_TOKEN` as backend-only; use the official KV v2 HTTP API with a scoped service token and redacted errors.
- [x] **Step 2:** Add metadata-only credential queries and creation/rotation compensation. After commit, delete the previous inactive Vault secret; if that deletion fails, retain its path for `vault:cleanup`. On explicit deletion, persist `delete_requested_at` and disable the row first, then delete Vault metadata/versions, then remove the row; a sealed Vault leaves an inactive row that `vault:cleanup` retries and removes. Failed compensation is queued durably, with an ID-based manual recovery path if PostgreSQL is unavailable. Keep plaintext out of SQL, list responses, and logs; never return `vault_path` to the TUI.
- [x] **Step 3:** Resolve the active application-specific credential before the shared fallback, then fetch its secret from Vault only for the upstream call. Make Vault sealed/unavailable/missing-secret errors fail closed.
- [x] **Step 4:** Implement `vault:cleanup` for inactive and queued paths, validate its PostgreSQL and Vault targets, and review path validation, token handling, failed-write cleanup, and secret deletion behavior. Run `npm run typecheck` and `npm run lint`.
- [x] **Step 5:** Review this task's scoped diff. Keep the working tree unstaged and uncommitted unless integration is requested.

### Task 4: Single-password administrative session and TUI

**Files:**
- Create: `src/lib/admin-session.ts`, `src/lib/admin-login-rate-limit.ts`, `scripts/set-admin-password.mjs`
- Modify: `src/lib/admin-password.ts`, `src/lib/admin-auth.ts`, `src/lib/admin-api.ts`, `src/lib/env.ts`, `src/http/routes/admin/session/route.ts`, `scripts/gateway-tui.mjs`, `scripts/gateway-tui-command.mjs`, `scripts/run-tui.mjs`, `.env.example`, `.env.tui.example`
- Modify: `src/tui/auth.ts`, `src/tui/api-client.ts`, `src/tui/config.ts`, `src/tui/main.ts`

**Interfaces:**
- `verifyAdminPassword(password: string): Promise<boolean>` parses `ADMIN_PASSWORD_HASH`, derives scrypt, and compares digests in constant time.
- `issueAdminSession(): { token: string; expiresAt: string }`, `isAdminSession(token: string): boolean`, and `revokeAdminSession(token: string): void` use random bearer tokens and an in-memory one-hour expiry; server restart invalidates all sessions.
- `POST /api/admin/session` accepts `{ password }` over loopback, returns `{ token, expiresAt }` on success and 401 on failure; the TUI never logs or persists either value.
- The login endpoint allows five password verifications per minute, then returns 429 with `Retry-After` before scrypt; a successful login clears the window.
- `signIn(password: string, config: TuiConfig): Promise<TuiSession>` calls that endpoint. `AdminApiClient` sends the session bearer and rejects non-loopback base URLs.

- [x] **Step 1:** Implement the hash generator with a hidden terminal prompt and random salt; output only the `ADMIN_PASSWORD_HASH` assignment for `.env.local`, never the entered password.
- [x] **Step 2:** Replace Supabase user/profile checks with password verification and bearer-session guards on every admin route. Reject malformed/multiple bearers and expired/revoked tokens before data access.
- [x] **Step 3:** Change the TUI prompt and API client to use only a local API session. Strip `DATABASE_URL`, `VAULT_TOKEN`, `ADMIN_PASSWORD_HASH`, and all legacy Supabase variables from the TUI child process in `run-tui.mjs`.
- [x] **Step 4:** Review URL validation, login/session/logout paths and all admin route guard call sites; login attempts are limited before scrypt. Run `npm run lint` and `npm run typecheck`.
- [x] **Step 5:** Review this task's scoped diff. Keep the working tree unstaged and uncommitted unless integration is requested.

### Task 5: Administrative catalog, policies, and audit queries

**Files:**
- Create: `src/lib/db/admin-catalog.ts`
- Modify: `src/http/routes/admin/applications/route.ts`, `src/http/routes/admin/identity-providers/route.ts`, `src/http/routes/admin/providers/route.ts`, `src/http/routes/admin/routes/route.ts`, `src/http/routes/admin/access/route.ts`, `src/http/routes/admin/origins/route.ts`, `src/http/routes/admin/audit/route.ts`, `src/http/routes/admin/resources/[resource]/[id]/route.ts`

**Interfaces:**
- `admin-catalog.ts` exports parameterized list/create/update/delete functions for the explicitly allowed resource tables; route handlers retain their existing request/response JSON shapes and `requireAdminApi(request)` guard.
- The generic resource handler maps its `resource` path segment to a fixed table allowlist and fixed editable columns, never interpolating client input into identifiers.

- [x] **Step 1:** Replace the listed Supabase operations with repository functions, preserving ordering, filters, insert defaults, status codes, and error envelopes.
- [x] **Step 2:** Keep generic update/delete resource names and fields allowlisted, and preserve the existing request schemas and per-route authorization order.
- [x] **Step 3:** Review each administrative response against its current TUI screen consumer, then run `npm run lint` and `npm run typecheck`.
- [x] **Step 4:** Review this task's scoped diff. Keep the working tree unstaged and uncommitted unless integration is requested.

### Task 6: API keys and OpenAPI import

**Files:**
- Create: `src/lib/db/admin-api-keys.ts`, `src/lib/db/openapi-import.ts`
- Modify: `src/http/routes/admin/api-keys/route.ts`, `src/http/routes/admin/api-keys/[id]/route.ts`, `src/http/routes/admin/openapi/import/route.ts`, `src/lib/admin-key-request.ts`

**Interfaces:**
- API-key creation writes only the SHA-256 digest and returns the raw 256-bit key once; listing never includes the raw key or hash.
- Key revocation sets `revoked_at` once and cannot be reversed, including via generic resource mutations.
- OpenAPI import performs route replacement/upsert in a PostgreSQL transaction scoped to one provider.

- [x] **Step 1:** Replace Supabase key CRUD and OpenAPI import calls with parameterized SQL while keeping current JSON and validation behavior.
- [x] **Step 2:** Preserve key hash lookup and revocation protections, and make an import failure roll back all route changes for that provider.
- [x] **Step 3:** Review key creation/listing/revocation and import failure paths by inspection. Run `npm run lint` and `npm run typecheck`.
- [x] **Step 4:** Review this task's scoped diff. Keep the working tree unstaged and uncommitted unless integration is requested.

### Task 7: Provision persistent services in Ubuntu WSL

**Files:**
- Create: `ops/vault.hcl.example`, `ops/gateway-vault-policy.hcl`
- Modify: `README.md`, `.env.example`, `package.json`
- Local machine: Ubuntu WSL PostgreSQL cluster, gateway database/role, persistent Vault service and KV v2 mount.

**Interfaces:**
- PostgreSQL listens locally and accepts only the gateway's technical role for its empty database.
- Vault listens on `127.0.0.1:43872`, uses `file` storage under a restricted WSL directory, and is initialized/unsealed outside the repository.
- The backend token has only required KV v2 data/metadata capabilities for `gateway/credentials/*` and is stored only in ignored local config.

- [x] **Step 1:** Use `Get-Command` on Windows and `command -v` in Ubuntu before installation; inspect existing services/configuration and verify intended paths before any move or recursive delete.
- [x] **Step 2:** Install/configure PostgreSQL and Vault in Ubuntu WSL if absent. Create the empty gateway role/database, persistent Vault config, KV v2 mount, and least-privilege policy/token without exposing passwords, root token, or unseal keys in tool output or Git.
- [x] **Step 3:** Initialize/unseal Vault and store recovery material in a private location outside the repository with restrictive permissions; document the location and manual unseal procedure for the operator. Generate the admin password hash through the hidden prompt and store only that hash in `.env.local`.
- [x] **Step 4:** Apply `npm run db:migrate` explicitly to the new local database and check PostgreSQL and Vault health from WSL and Windows loopback. Do not target Supabase.
- [x] **Step 5:** Review the on-machine configuration and scoped repository diff. Keep the working tree unstaged and uncommitted unless integration is requested.

### Task 8: Remove obsolete code and finish documentation

**Files:**
- Delete: `src/app/**`, `src/lib/supabase/**`, `supabase/**`, `next.config.ts`, `next-env.d.ts`, the obsolete Next.js-only `AGENTS.md`, obsolete browser pages/components/assets, and `vercel.json`. Leave ignored private local environment files and generated caches untouched.
- Modify: `README.md`, `docs/client-examples.md`, `scripts/security-check.mjs`, `.github/workflows/ci.yml`, `package.json`, `package-lock.json`, `.env.example`, `.env.tui.example`
- Preserve: `src/tui/**`, `src/http/**`, `src/server/**`, `src/lib/db/**`, and ignored private local environment files.

**Interfaces:**
- `npm run tui` and the backend documented workflow use only local API/PostgreSQL/Vault configuration.
- `rg` finds no runtime `@supabase/supabase-js` import, hosted Supabase URL, browser admin entry point, or stale Supabase setup instruction.

- [x] **Step 1:** Remove remaining Supabase/browser code, Next.js configuration and generated types, plus any Next.js/React dependencies after the Hono routes replace their callers.
- [x] **Step 2:** Update docs, examples, security scan, and CI for the local workflow, including manual Vault unseal, token rotation, database migration, and a secret-safe TUI launch.
- [x] **Step 3:** Review `rg` results for obsolete runtime references, inspect `git diff --check`, then run `npm run security:check`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
- [x] **Step 4:** Review every changed/deleted path. Keep all changes unstaged and uncommitted unless integration is requested.
