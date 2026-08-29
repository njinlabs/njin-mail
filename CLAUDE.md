# njin-mail

Multi-tenant webmail client built with Bun. One fixed IMAP/SMTP backend server serves many client domains (tenants) — e.g. `j3company.com`, `jadiweb.id` — each reached through its own webmail hostname (`mail.j3company.com`, `mail.jadiweb.id`) that DNS/proxies to this same app instance. There is no per-account "add mail account" UI: users log in with just their email + password, and the login IMAP attempt itself is the validation.

**Critical constraint**: a user from one tenant domain must never be able to log in through another tenant's webmail hostname (e.g. `support@j3company.com` must be rejected if it tries to log in via `mail.jadiweb.id`).

## Architecture

- **Domain enforcement is per-request, based on the `Host` header**, NOT on `IMAP_HOST`/`SMTP_HOST` (those are one fixed backend, shared by every tenant). See `apps/server/src/lib/tenant.ts`: `getTenantDomainFromHost()` strips a `mail.` prefix from the incoming `Host` header to get the allowed domain; `emailMatchesTenantDomain()` checks the login email's domain against it.
- **No persisted IMAP/SMTP passwords.** Login validates directly against IMAP (`verifyImapCredentials` in `imapClient.ts`); on success the password is encrypted (AES-256-GCM, `lib/crypto.ts`) and kept only in an **in-memory session store** (`lib/sessionStore.ts`, `Map<sessionId, SessionData>`), tied to a session cookie (`njin_sid`, httpOnly). Sessions are lost on server restart by design. The `users` table only stores email/tenantDomain/displayName/timestamps, never a password.
- **Monorepo** (Bun workspaces): `apps/server` (Hono API + `Bun.serve`), `apps/web` (Vite + React + Tailwind + shadcn/ui), `packages/shared` (shared DTO types). Dev: Vite on :5173 proxies `/api` to Hono on :3001. Prod: Hono serves the built `apps/web/dist` as static files with SPA fallback, single process.
- **DB**: SQLite via `bun:sqlite` + Drizzle ORM. Schema: `users`, `folders`, `messages`, `attachments`, `sync_state` — all scoped by `user_id`.

## Gotchas (don't repeat these)

- `drizzle-kit` config (`drizzle.config.ts`) must live **inside `apps/server`**, not the workspace root — at the root it resolves the wrong `drizzle-orm` from a different `node_modules` and fails with "Please install latest version of drizzle-orm".
- Bun does **not** auto-load a `.env` from a parent directory — only from `process.cwd()`. Since the server's cwd is `apps/server`, its scripts (`dev`, `start`, `db:migrate`) run with `--env-file=../../.env` pointing at the root `.env`.
- React Router v7 dropped the `:param?` optional-param syntax — use two separate `<Route>` entries instead (e.g. `/mail` and `/mail/:folderId`).
- Use `@types/bun` (not `bun-types`) as the devDependency, with `"types": ["bun"]` in `apps/server/tsconfig.json`.

## Build order / progress

Full milestone plan (API design, DB schema details, frontend structure, MVP scope) — see git history / this file's updates going forward as the source of truth.

**Done & verified:**
1. Repo scaffold (workspaces, Hono server, Vite/React/Tailwind web) — installs, boots, typechecks clean.
2. `bun:sqlite` + Drizzle schema + migrations — verified via seed script.
3. `imapflow`/`nodemailer` Bun-compatibility scripts (`src/scripts/imapTest.ts`, `smtpTest.ts`) — verified against a real `mail.jadiweb.id` test account.
4. Credential encryption (`crypto.ts`) + in-memory session store (`sessionStore.ts`) — unit tested.
5. Hono skeleton with session middleware + prod static serving.
6. Auth API (`POST /api/auth/login|logout`, `GET /api/auth/session`) — verified end-to-end: correct-tenant login succeeds, wrong-tenant `Host` header rejected 401 before IMAP is even attempted, session/logout cookie flow correct.

**Next up:** Milestone 7 (folder sync — populate `folders` table from IMAP `LIST` for the active session's user), then 8 (message sync engine), 9 (messages API), 10 (send API), 11+ (frontend).

Key files so far: `apps/server/src/routes/auth.ts`, `apps/server/src/lib/{tenant,crypto,sessionStore,imapClient}.ts`, `apps/server/src/middleware/session.ts`, `apps/server/src/db/schema.ts`.

## Test environment

`.env` (gitignored, at repo root) has `IMAP_HOST`/`SMTP_HOST=mail.jadiweb.id` and generated `CREDENTIAL_ENCRYPTION_KEY`/`SESSION_SECRET` for local dev. A real test mailbox on `mail.jadiweb.id` was used to verify IMAP/SMTP end-to-end (Stalwart IMAP4rev2 server; folders: INBOX, Sent Items, Drafts, Junk Mail, Deleted Items, Notes). The test password is intentionally not stored anywhere in the repo — ask the user again if live-credential testing is needed.
