# Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (if the user chooses delegated execution) or `superpowers:executing-plans` (if the user chooses inline execution) to carry out this plan task by task. Keep the existing local worktree changes intact.

**Goal:** Replace the question-by-question admin TUI with a usable full-screen terminal application and add a matching `gateway` CLI for all ten administrative areas, sharing the existing local admin API and preserving secret handling.

**Architecture:** Both clients call the loopback Hono admin API through the existing `AdminApiClient`; neither client accesses PostgreSQL or Vault directly. The CLI creates and revokes a short-lived API session for each command. The TUI holds its session token in memory until exit. Add only validated admin API mutations that are missing for the management actions exposed by both clients.

**Tech Stack:** Node.js 22+, TypeScript, React 19.3, Ink 7.1.1 for alternate-screen terminal rendering, existing Hono API, existing Inquirer prompts for hidden password/secret input where suitable, PostgreSQL and Vault through current server code. Ink provides terminal input, window-size handling, and alternate-screen behavior; see the [Ink README](https://github.com/vadimdemedes/ink/blob/master/readme.md) and [package metadata](https://raw.githubusercontent.com/vadimdemedes/ink/master/package.json).

**Spec:** [gateway-tui-cli-redesign-design.md](../specs/2026-09-28-gateway-tui-cli-redesign-design.md)

## Global Constraints

- Preserve all pre-existing user changes in the worktree; inspect diffs before editing shared files and do not stage or commit changes.
- Do not run Unterm. Keep commands and verification in the normal PowerShell/shell workspace.
- Keep the API as the only database/Vault boundary. Clients call only loopback `/api/admin/*` routes.
- Never accept a password or upstream secret as a command-line argument. Never print, log, or serialize upstream secrets. Show a generated API key only in the immediate create response.
- Reuse the existing request schemas, session endpoint, `AdminApiClient`, and admin-key mutation protection.
- Keep user-facing TUI and CLI messages in Spanish.
- Do not add or run automated tests unless the user asks. Perform only static review and explicitly requested verification.

## Review Focus

- TUI navigation state: initial selection, back/forward history, form draft preservation, narrow terminal layout, and keyboard help.
- Resource action mapping: every exposed create/update/enable/disable/delete/revoke/import/list action maps to a supported server operation.
- Auth boundaries: password/token lifetime, loopback-only URLs, session revocation on command completion, and expired-session behavior.
- Secret boundaries: hidden input and stdin handling, redaction from errors/logging, one-time API key response, and no secret in metadata listings.
- Cross-platform launch behavior: existing WSL launcher, installed `gateway` executable, terminal dimensions, and interrupt/exit cleanup.

---

## Task 1: Map administrative operations and API gaps

**Files:**
- Read: `src/http/routes/admin/**`
- Read: `src/lib/admin-schemas.ts`
- Read: `src/lib/db/**`
- Read: `src/tui/screens/**`

1. Record the confirmed current route baseline in the implementation notes, then inspect schemas, DB functions, and screens to finish the operation matrix for all ten areas.
   - `applications`, `identity-providers`, `providers`, `routes`: collection GET/POST plus generic enable/disable; check which resource fields need a dedicated update route and how details/relationships are loaded.
   - `access`, `origins`: collection GET/POST upserts; determine how to edit or remove an existing mapping and how to navigate its two related resources.
   - `credentials`: GET/POST plus generic enable/disable/delete; secret values must remain write-only.
   - `api-keys`: GET/POST plus ID-specific revoke; the create response is the only place the full key is returned.
   - `openapi`: import operation; identify the import preview/result shape and its route relationships.
   - `audit`: read-only listing; determine supported filters and detail fields.
2. Reuse existing routes for list/create, access/origin upserts, generic enable/disable, credential deletion, API-key revocation, OpenAPI import, and audit queries.
3. For each missing edit operation required by the UI, add a narrow route using the resource's existing Zod schema and DB layer; avoid a generic arbitrary-field update endpoint. Keep resource-specific invariants in the server.
4. Keep destructive actions behind the existing admin-key mutation guard where currently required and return `Cache-Control: no-store` for sensitive responses.
5. Capture response shapes and relationship identifiers so both clients can share the same resource types and action map.

**Review checkpoint:** Confirm there is an explicit operation-to-route mapping for all ten areas before adding client actions.

## Task 2: Establish shared client types and resource operations

**Files:**
- Modify: `src/tui/api-client.ts`
- Create: `src/admin-client/types.ts`
- Create: `src/admin-client/resources.ts`
- Modify: `tsconfig.json`

1. Move or re-export the authenticated HTTP client from a shared client module so the TUI and CLI use identical loopback checks, JSON handling, error decoding, and redirects.
2. Define shared resource summaries, detail records, relationship links, and operation results based on actual API response shapes.
3. Define a single area registry for the ten admin areas with labels, endpoints, list columns, relationship lookups, and supported actions. Keep mutations explicit and typed.
4. Add TSX compilation support (`jsx: react-jsx`) and include the new shared client and TUI TSX files without broadening compilation into deleted/obsolete app paths.

## Task 3: Implement missing API mutations

**Files:**
- Modify only the route modules identified in Task 1 under `src/http/routes/admin/**`
- Modify only related schemas in `src/lib/admin-schemas.ts`
- Modify only required database functions under `src/lib/db/**`

1. Add validated resource-specific update operations for fields that the management UI needs to edit and that the API does not currently support.
2. Validate identifiers and request bodies with existing Zod conventions; enforce parent/owner relationships and active-state constraints in the API/database layer.
3. Return only metadata for credentials and hashed API keys. Keep secret writes routed through existing Vault-backed credential creation.
4. Preserve audit/error response conventions and safe error messages; do not return raw database or Vault errors.

## Task 4: Build the full-screen keyboard-first TUI

**Files:**
- Add dependencies: `ink@7.1.1`, `react@19.3.x`, and compatible React types if required by the installed TypeScript setup
- Modify: `package.json`, `package-lock.json`
- Create: `src/tui/app.tsx`
- Create: `src/tui/components/**`
- Create: `src/tui/state/**`
- Replace/refactor: `src/tui/menu.ts`, `src/tui/main.ts`, and area screens under `src/tui/screens/**`
- Modify: `src/tui/auth.ts` only as needed for session lifecycle and safe terminal prompts

1. Add Ink and React dependencies compatible with the project's Node 22 runtime and configure TSX entry execution through the existing `tsx` loader.
2. Implement an alternate-screen shell with grouped navigation, visible location/breadcrumb, status summary, list and detail panes, and a footer showing available keys.
3. Adapt the layout to terminal width: three panels when space permits, stacked navigation/list/detail when narrow. Use text/icon markers as well as color for selection and state.
4. Implement keyboard controls for arrows, Enter, Escape, Back/Forward, `?`/F1, contextual actions, and graceful Ctrl+C cleanup.
5. Implement a navigation history model. Back/Forward traverses screen history; multi-step forms validate before advancing and retain values when returning to prior steps.
6. Implement home counts/backend state, list/detail views, relationship links, contextual create/edit/enable/disable/delete/revoke/import actions, and recovery-oriented Spanish errors.
7. Confirm destructive writes and show a concise change summary before applying significant updates. Keep secret forms masked; display a newly generated API key once with an explicit copy/save instruction.
8. Remove the flat question-by-question main navigation while retaining compatible hidden prompts for login and secret entry.

## Task 5: Add the authenticated `gateway` CLI

**Files:**
- Create: `src/cli/main.ts`
- Create: `src/cli/parser.ts`
- Create: `src/cli/format.ts`
- Create: `src/cli/input.ts`
- Create: `src/cli/auth.ts`
- Modify: `scripts/gateway-tui.mjs` or create: `scripts/gateway.mjs` as the package executable entry
- Modify: `package.json`, `package-lock.json`

1. Add the `gateway` executable and command tree: `gateway tui` plus `<area> <action>` for each of the ten registry areas. Provide top-level and area-level `--help`.
2. Support readable default tables, structured `--json`, clear exit codes, and safe validation errors. Reuse the operation registry and shared admin API client.
3. For interactive commands, request the admin password through hidden input, create a local admin session, perform the action, and revoke the session in `finally`.
4. For non-interactive writes, support `--input-json` by reading one JSON object from stdin. The password and any secret must be fields in stdin input, never option values or positional arguments. Reject sensitive fields supplied through argv.
5. Confirm deletes and other explicitly destructive actions interactively; permit `--yes` for deliberate automation. Do not prompt in non-interactive mode without `--yes`.
6. For credential creation, consume the secret from masked input or stdin and return only safe metadata. For API-key creation, write the complete generated key once to the selected output and never to logs.
7. Preserve `gateway-tui` temporarily as a compatibility alias if the current Windows/WSL wrapper depends on it; route it to `gateway tui` and update README examples to the canonical command.

## Task 6: Align launchers and documentation

**Files:**
- Modify: `scripts/gateway-tui.mjs`
- Modify: `scripts/run-tui.mjs` only if the new entry point requires it
- Modify: `README.md`
- Modify: `docs/client-examples.md` only if command examples are documented there
- Modify: `.env.tui.example` only if the current configuration names need clearer documentation

1. Make `gateway tui` and the existing `npm run tui` path reach the same TUI entry point.
2. Preserve the existing Windows WSL launcher behavior and document how to install/link the new executable for local use.
3. Document CLI commands for all areas, interactive and stdin JSON examples that contain placeholders only, output formats, destructive confirmation, and the one-time API key display.
4. Document session behavior, loopback-only configuration, credential storage in Vault, and the fact that CLI passwords and upstream secrets never belong in shell arguments.

## Task 7: Static review and manual verification checklist

**Files:**
- Read all changed files and `docs/superpowers/specs/2026-09-28-gateway-tui-cli-redesign-design.md`

1. Review the final diff for accidental edits to unrelated local changes and verify no file was staged or committed.
2. Review all routes and clients for matching operation/response shapes and ensure every area has list, detail, supported mutations, and contextual relationships.
3. Manually inspect TUI flows at wide and narrow terminal sizes: navigation, back/forward, retained form values, validation recovery, relationships, help, and cancellation.
4. Manually inspect CLI help, table and JSON output, stdin JSON handling, interactive destructive confirmation, `--yes`, session cleanup, and exit codes.
5. Inspect secret paths for argv exposure, shell-history examples, console logging, metadata responses, and accidental retention in client state after completion.
6. Do not run automated tests or claim test success unless the user asks for test execution.

## Execution Notes

- Tasks 1–3 establish server capabilities and shared contracts before UI work.
- Tasks 4 and 5 can proceed independently after the shared operation registry is stable, but they touch related client types. Coordinate edits if delegated.
- Task 6 follows the chosen command shape; Task 7 closes the work with static and manual review.
- Before implementation, the user should choose inline execution or delegated task-by-task execution after reviewing this plan.
