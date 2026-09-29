# Local TUI Gateway Implementation Plan

> **Superseded:** this plan describes Next.js and hosted Supabase. The active design is `docs/superpowers/specs/2026-09-27-local-postgres-wsl-design.md` and the active plan is `docs/superpowers/plans/2026-09-27-local-postgres-vault.md`. Do not execute these steps.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the gateway's web administration portal with a local TUI while preserving the local HTTP gateway and using hosted Supabase.

**Architecture:** Keep the current Next.js Route Handlers on loopback and add a terminal client that signs into Supabase Auth and calls the admin endpoints with a bearer access token. The backend validates that token, preserves the current admin allow-list/profile checks, and remains the only process that uses the service-role key.

**Tech Stack:** Next.js 16 Route Handlers, TypeScript, Node.js 22+, Supabase JS, `inquirer` 12.10.0, `tsx`.

**Spec:** `docs/superpowers/specs/2026-09-27-local-tui-gateway-design.md`

## Global Constraints

- Bind the backend to `127.0.0.1` and default to port `3006`.
- The default database target is a hosted Supabase project; application startup never starts, resets, migrates, or seeds a database.
- The TUI uses Supabase URL and publishable key only; `SUPABASE_SERVICE_ROLE_KEY` and upstream credentials remain backend-only.
- Store Supabase TUI sessions in memory only and validate admin bearer tokens on the backend.
- Require both the configured `ADMIN_EMAILS` allow-list and an enabled `profiles.role = 'admin'` profile.
- Preserve consumer routes, auth, scopes, rate limits, security checks, migrations, and audit behavior.
- Do not add or run tests in this implementation unless the user later requests testing; use lint, typecheck, build, and scoped manual review as applicable.
- Preserve all pre-existing working-tree changes and only stage files belonging to this refactor.

## Review Focus

- Empty, invalid, expired, or refreshed Supabase sessions must not authorize admin actions; the owning task verifies API guard behavior through code review and typecheck.
- A valid Supabase user missing from `ADMIN_EMAILS` or lacking an enabled admin profile must remain unauthorized; the auth task verifies both checks remain in the guard.
- Missing hosted Supabase configuration must fail with actionable variable names and must not fall back to a local Supabase URL; the env task verifies the startup path and sample configuration.
- A non-loopback TUI API URL must be rejected before credentials are sent; the TUI API-client task verifies URL validation and request construction.
- API keys and Vault credentials must only be displayed at creation or write time as currently supported; feature tasks verify the TUI does not fetch or log plaintext secrets after creation.

---

### Task 1: Accept Supabase bearer sessions on admin API routes

**Files:**
- Modify: `src/lib/admin-auth.ts`
- Modify: `src/lib/admin-api.ts`
- Create: `src/app/api/admin/session/route.ts`
- Modify: every route under `src/app/api/admin/**/route.ts`

**Interfaces:**
- `getAdminContext(request: Request): Promise<AdminContext | null>` extracts a single Bearer token, validates it through Supabase Auth, then applies the current email allow-list and enabled admin profile checks.
- `requireAdminApi(request: Request): Promise<NextResponse | null>` returns the existing 401 JSON response when validation fails.
- `POST /api/admin/session` validates a Supabase Auth bearer token, checks the verified user's email against `ADMIN_EMAILS`, and promotes only an existing enabled profile to `admin`; missing or disabled profiles are rejected, and disabled profiles remain disabled.
- Each admin route passes its incoming `Request` to `requireAdminApi` before reading or mutating data.

- [ ] **Step 1: Extract and validate exactly one Bearer token in the admin auth module.** Use the server Supabase client's `auth.getUser(token)`; do not trust claims or caller-provided identity fields.
- [ ] **Step 2: Implement `POST /api/admin/session`.** Promote only a verified, allow-listed user's existing enabled profile; return 403 for a disabled profile and a clear setup error if no profile exists.
- [ ] **Step 3: Update `getAdminContext(request)` and `requireAdminApi(request)`.** Require verified identity, allow-listed email, `role = 'admin'`, and `enabled = true`.
- [ ] **Step 4: Update all admin route call sites to pass the request.** Keep response shape and data behavior unchanged.
- [ ] **Step 5: Run `npm run typecheck`.** Expected: success with all admin routes using the request-aware guard.
- [ ] **Step 6: Review the diff.** Confirm no consumer route or gateway authentication path was changed.

### Task 2: Add TUI configuration, Supabase sign-in, and authenticated API client

**Files:**
- Create: `src/tui/config.ts`
- Create: `src/tui/auth.ts`
- Create: `src/tui/api-client.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- `readTuiConfig(env: NodeJS.ProcessEnv): TuiConfig` reads the hosted Supabase URL, publishable key, and local API URL; the API URL defaults to `http://127.0.0.1:3006` and must resolve to a loopback host.
- `signIn(email: string, password: string): Promise<TuiSession>` uses Supabase Auth with persistence disabled, calls `POST /api/admin/session`, and returns a `TuiSession` containing the Supabase client in memory.
- `AdminApiClient.request<T>(path: string, init?: RequestInit): Promise<T>` sends the bearer token and JSON headers, parses the existing error envelope, and rejects non-loopback URLs before any network request.
- Add exact `inquirer@12.10.0` and `tsx` dependencies; add `npm run tui` using Node's `.env.local` loading and the TypeScript import hook.

- [ ] **Step 1: Add `inquirer@12.10.0` and `tsx` using npm and define the `tui` script.** Pin Inquirer because the current Windows PowerShell + Node 22 environment has a reported keyboard-input regression in later major versions; keep the lockfile synchronized.
- [ ] **Step 2: Implement TUI config parsing and loopback URL validation.** Missing values must name the exact environment variable; never read the service-role key in TUI code.
- [ ] **Step 3: Implement Supabase email/password sign-in with `persistSession: false`.** Use Inquirer's masked password prompt, call the admin session bootstrap route, and expose sign-out by dropping the in-memory client/session.
- [ ] **Step 4: Implement `AdminApiClient.request<T>`.** Resolve the current access token from the in-memory Supabase client for each request, send it only to `/api/admin/*`, and convert non-2xx API responses to actionable terminal errors without printing request bodies or tokens.
- [ ] **Step 5: Run `npm run typecheck`.** Expected: success for new TUI modules and dependencies.

### Task 3: Add TUI screens for core gateway configuration

**Files:**
- Create: `src/tui/main.ts`
- Create: `src/tui/menu.ts`
- Create: `src/tui/screens/applications.ts`
- Create: `src/tui/screens/identity-providers.ts`
- Create: `src/tui/screens/providers.ts`
- Create: `src/tui/screens/routes.ts`
- Create: `src/tui/screens/access.ts`
- Create: `src/tui/screens/origins.ts`

**Interfaces:**
- `runTui(): Promise<void>` checks that the backend health route is reachable, signs in, enters the main menu, and exits cleanly on cancellation.
- Each screen exports `run(client: AdminApiClient): Promise<void>` and returns to the main menu after completion or a handled API error.
- Screens use existing admin endpoints and their current payloads; they do not write to Supabase directly.

- [ ] **Step 1: Implement the main entry point and menu.** Include sign-in, backend-unavailable messaging, screen navigation, and explicit sign-out/exit.
- [ ] **Step 2: Implement applications and identity-provider screens.** Support the same list, create, and enable/disable operations currently available in the portal.
- [ ] **Step 3: Implement provider and route screens.** Preserve current fields and validation; support route listing, creation, and enable/disable.
- [ ] **Step 4: Implement access and origin screens.** Preserve application/provider selection, rate-limit fields, and origin validation.
- [ ] **Step 5: Run `npm run typecheck`.** Expected: all screen modules and menu interfaces compile.
- [ ] **Step 6: Review each screen against its current browser form and matching API route.** Confirm fields and operations are not lost.

### Task 4: Add TUI screens for credentials, API keys, OpenAPI import, and audit

**Files:**
- Create: `src/tui/screens/credentials.ts`
- Create: `src/tui/screens/api-keys.ts`
- Create: `src/tui/screens/openapi.ts`
- Create: `src/tui/screens/audit.ts`
- Modify: `src/tui/menu.ts`

**Interfaces:**
- Each screen exports `run(client: AdminApiClient): Promise<void>` and uses existing `/api/admin/*` routes.
- API key creation displays the returned full key once and does not retain or log it; listing shows metadata only and revocation stays permanent.
- Credential creation accepts a secret through masked terminal input, sends it once to the loopback backend, and does not echo it afterward.

- [ ] **Step 1: Implement credential creation and listing.** Send the masked secret once to the loopback backend; keep upstream secret values out of list responses and terminal logs.
- [ ] **Step 2: Implement API key listing, creation, and revocation.** Make the one-time plaintext key visible long enough to copy and explain that it cannot be retrieved later.
- [ ] **Step 3: Implement OpenAPI import with multiline input.** Reuse existing request validation and summarize created routes.
- [ ] **Step 4: Implement audit listing and add all screens to the main menu.** Keep display limited to fields already returned by the API.
- [ ] **Step 5: Run `npm run typecheck`.** Expected: all TUI features compile.
- [ ] **Step 6: Review secret-handling paths.** Confirm passwords, access tokens, API keys, and provider secrets are not written to files or logs.

### Task 5: Remove browser-facing application and OAuth-only code

**Files:**
- Delete: `src/app/page.tsx`
- Delete: `src/app/admin-console.tsx`
- Delete: `src/app/api-keys-tab.tsx`
- Delete: `src/app/login/page.tsx`
- Delete: `src/app/login/login-button.tsx`
- Delete: `src/app/docs/page.tsx`
- Delete: `src/app/ui-icons.tsx`
- Delete: `src/app/globals.css`
- Delete: `src/app/auth/local/route.ts`
- Delete: `src/app/auth/callback/route.ts`
- Delete: `src/app/auth/signout/route.ts`
- Delete: `src/lib/supabase/browser.ts`
- Modify or delete: `src/app/layout.tsx`
- Modify: `src/lib/admin-auth.ts`
- Modify: `src/lib/supabase/server.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Keep `/api/health`, `/api/openapi`, `/api/v1/*`, and `/api/admin/*` route handlers.
- Retain only framework-required root layout code, if Next.js 16 requires it for a route-only application.
- Remove `@supabase/ssr` if no retained route uses cookie-based sessions.

- [ ] **Step 1: Search for every import and link to browser-only modules.** Record references before deletion.
- [ ] **Step 2: Remove pages, login/session routes, browser client, icons, and styling.** Keep machine-readable OpenAPI and health routes.
- [ ] **Step 3: Remove page-only auth helpers and SSR cookie client code.** Preserve bearer-token admin checks from Task 1.
- [ ] **Step 4: Remove OAuth setup and browser portal dependencies that are no longer referenced.** Keep Supabase JS for the TUI and backend.
- [ ] **Step 5: Run `npm run lint` and `npm run typecheck`.** Expected: no unresolved page imports, unused web modules, or typing errors.

### Task 6: Make local backend and hosted Supabase the documented default

**Files:**
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/client-examples.md`
- Modify: `src/app/api/openapi/route.ts`
- Modify: `src/lib/env.ts`
- Modify: `next.config.ts`
- Modify or delete: `scripts/setup-local.mjs`
- Modify or delete: `scripts/test-local.mjs`
- Modify: `scripts/security-check.mjs`
- Delete: `vercel.json`
- Review: `supabase/config.toml`
- Review: `.github/workflows/**`

**Interfaces:**
- `npm run dev:local` starts the backend on `127.0.0.1:3006`; `npm run tui` starts the operator interface in a separate terminal.
- Server configuration requires the hosted Supabase URL, publishable key, service-role key, and admin allow-list. TUI configuration requires only the hosted URL, publishable key, and local API URL.
- The normal setup has no `supabase start`, `supabase db reset`, local seed, or deployment command.

- [ ] **Step 1: Update the environment schema and `.env.example`.** Use clear server/TUI variable descriptions and reject missing or malformed configuration without local Supabase fallback.
- [ ] **Step 2: Bind all local run commands to loopback.** Add a local production start command only if it is needed to run a built app; do not add public host defaults.
- [ ] **Step 3: Remove or rework setup scripts that seed/reset the configured database.** Keep the mock upstream fixture only if it has no automatic database side effects.
- [ ] **Step 4: Rewrite README local setup for hosted Supabase.** Document explicit migration application, two-terminal startup, TUI login, consumer API URL, and development-project data caution.
- [ ] **Step 5: Remove Vercel configuration and deployment guidance.** Review CI workflows and security checks so they no longer expect a deployable web portal or forbidden local database reset.
- [ ] **Step 6: Run `npm run lint`, `npm run typecheck`, and `npm run build`.** Expected: the route-only Next.js backend and terminal client produce no browser routes or deployment assumptions.
- [ ] **Step 7: Review final diff and working-tree status.** Confirm the consumer HTTP contract is unchanged and no pre-existing user changes were staged or committed.

## Execution notes

- Work in the current checkout to retain the existing uncommitted API-key and security changes. Stage only files explicitly listed for this refactor.
- Do not run `npm test`, add test files, execute local fixture/setup commands, or apply Supabase migrations without a later explicit request.
- If Next.js 16 requires a root layout or browser build artifacts despite the route-only design, keep only the minimal framework requirement and document why.
