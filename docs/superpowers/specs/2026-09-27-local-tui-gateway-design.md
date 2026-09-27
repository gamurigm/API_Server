# Local TUI Gateway Design

## Purpose

Refactor the Federated API Gateway into a local backend operated through an interactive terminal UI. Consumer applications continue to call the gateway over HTTP on the same machine. The gateway connects to an online Supabase project for authentication, configuration, Vault secrets, rate limits, and audit data.

## Confirmed decisions

- The administrative interface is a TUI; browser pages are removed.
- Keep the existing Next.js Route Handlers and gateway business logic to preserve the current HTTP contract and reduce migration risk.
- Run the backend on loopback only (`127.0.0.1`), with port `3006` as the current local default.
- Keep the consumer gateway HTTP API available locally.
- Use a hosted Supabase project. The normal setup must not start or reset a local Supabase database.
- Authenticate the TUI operator with Supabase Auth email and password. The TUI obtains the session through Supabase Auth and sends its access token to administrative API routes. The service-role key remains backend-only.
- After Supabase Auth verifies the user, a backend bootstrap endpoint promotes that user's existing enabled profile to `admin` only when the verified email is in `ADMIN_EMAILS`. It never re-enables a disabled profile. Normal admin routes still require the allow-list and enabled admin profile checks.
- Preserve existing admin allow-list/profile checks and consumer authentication (gateway API keys and RS256 JWTs).
- Preserve existing administrative capabilities, including applications, identity providers, providers, routes, access policies, origins, Vault credentials, OpenAPI import, audit, and gateway API key management.

## Architecture

The application has two local processes during development: the Next.js backend and the TUI client. The backend binds to loopback and serves both the existing consumer routes and administrative routes. The TUI connects to the backend URL (default `http://127.0.0.1:3006`), signs the operator into the hosted Supabase Auth project, and holds the resulting session in memory. After sign-in, the TUI calls `POST /api/admin/session` with the access token. The backend validates the token with Supabase Auth, checks the verified email against `ADMIN_EMAILS`, and promotes the existing profile only when it is enabled. Administrative requests then carry the same bearer token. Every admin route validates it and requires both the configured email allow-list and an enabled admin profile before performing an operation.

Only the backend uses `SUPABASE_SERVICE_ROLE_KEY`. The TUI uses the Supabase project URL and publishable key for operator sign-in. Supabase migrations remain explicit operator actions against the linked hosted project; application startup never applies migrations, resets a database, or seeds records.

The TUI is a terminal-only client with a navigable menu, forms, tabular lists, validation feedback, and clear loading/error states. Its API client centralizes local URL selection, bearer authentication, JSON handling, and gateway error reporting. Administrative features continue to use the existing `/api/admin/*` routes. The consumer contract under `/api/v1/*` remains unchanged.

## Authentication and security

- The TUI prompts for credentials without echoing the password and never writes access or refresh tokens to disk.
- The local backend listens only on `127.0.0.1`; the TUI rejects non-loopback backend URLs by default. An explicit override is out of scope.
- Administrative API authorization accepts the TUI's Supabase bearer token and validates it server-side. A caller-provided email or unverified JWT claims are never sufficient.
- `POST /api/admin/session` is the only route that can promote an enabled profile, and only after server-side token validation and an `ADMIN_EMAILS` match. A disabled profile is rejected and remains disabled.
- Existing `ADMIN_EMAILS` and enabled `profiles.role = 'admin'` checks remain required.
- The TUI never receives the service-role key or upstream provider credentials.
- Consumer gateway authentication, scopes, rate limits, network protections, and audit behavior remain intact.
- Online database credentials and URLs are provided through ignored local environment files; examples contain placeholders only.

## Scope and exclusions

Remove the browser admin console, browser login flow, browser-only Supabase client, CSS/icon assets used only by those pages, and public documentation page. Keep machine-readable API documentation and health endpoints. Remove Vercel deployment configuration and deployment guidance because this version is local-only. Keep the Supabase migrations and CLI configuration needed to manage the hosted database. The local fixture may remain for isolated gateway checks, but automated setup must not create or reset data in the configured hosted project.

This refactor does not change the gateway's upstream proxy contract, add remote hosting, replace Next.js, or redesign the database schema.

## Local workflow

1. Configure the hosted Supabase URL, publishable key, service-role key, local API URL, and admin email allow-list in a local ignored environment file.
2. Apply reviewed migrations explicitly to the intended hosted Supabase project.
3. Start the backend on loopback.
4. Start the TUI in another terminal, sign in, and administer the gateway.
5. Point consumer applications at the local gateway URL.

Documentation must identify that the Supabase project is remote and persistent even though the backend and TUI run locally. It must warn against using a production Supabase project for local development fixtures.

## Completion criteria

- No browser-facing administrative, login, or documentation page is part of the application.
- The backend serves the existing consumer API and administrative API on loopback.
- Every current administrative capability is reachable from the TUI.
- TUI admin requests use a verified Supabase Auth session and retain the current allow-list/profile authorization checks.
- The TUI has no access to service-role or upstream secrets, and does not persist auth tokens.
- The documented default workflow uses the hosted Supabase project without starting, resetting, or seeding a local database.
- Hosting/deployment guidance and Vercel-specific configuration are removed.
- Existing gateway behavior, database schema, migrations, and consumer API contract are preserved.
