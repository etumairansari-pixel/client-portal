# Eiretech Client Portal

Client management and client-facing delivery portal for Eiretech. Owners onboard clients, agree scope and requirements
with them, and run delivery in the open; clients follow their project, sign off on each stage, and raise change requests
— all inside one tenant-isolated application.

The application runs on its **own backend**. Directus has been completely removed; there is no external CMS, BaaS or
admin framework in the stack.

## Architecture

| Layer      | Technology                                                              |
| ---------- | ----------------------------------------------------------------------- |
| UI         | Nuxt 3 / Vue 3, Nuxt UI 2, Tailwind CSS                                 |
| API        | Nuxt Server API (Nitro / h3 route handlers under `server/api`)          |
| Data       | Prisma 6 → MongoDB Atlas                                                |
| Passwords  | Argon2id (`@node-rs/argon2`)                                            |
| Sessions   | Database-backed, opaque id in an `httpOnly` cookie (`eiretech_session`) |
| Validation | Zod on every mutating route                                             |
| Files      | Local disk behind a storage boundary (`server/services/storage.ts`)     |

```
pages/ + layers/portal/        Vue pages: owner console (/admin) and client portal (/portal)
components/                    Shared UI (workspace tabs, milestone list, CR threads, SRS review…)
server/api/                    HTTP routes, split admin/* (OWNER) and portal/* (CLIENT)
server/services/               Business logic, audit, notifications, mail, storage
server/utils/auth.ts           requireUser / requireOwner / requireClient
shared/                        Rules shared by client and server (progress formula, CR transitions, templates)
prisma/schema.prisma           Data model
scripts/*-matrix.mjs           End-to-end HTTP test suites
```

### Roles

There are exactly two human roles:

- **OWNER** — Eiretech staff. Full access to every organisation, project and workflow.
- **CLIENT** — belongs to one organisation. Sees only that organisation's data.

Tenant isolation is enforced server-side: a client's `organizationId` is always taken from the session, never from the
request, and every portal query is pinned to it. A foreign id resolves to `404`, an owner-only route to `403`.

### Modules

| Module             | What it does                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| Authentication     | Sign-in, forced first-login password change, forgot/reset with single-use expiring tokens, suspension     |
| Clients            | Organisation + primary contact onboarding, temporary credentials, access reset                            |
| Projects           | Lifecycle stage, health (with reason), target dates, delivery readiness                                   |
| Scope              | Versioned discovery questionnaire, file uploads, threaded clarifications, approval that locks the scope   |
| SRS / Requirements | Owner-authored requirements sent to the client; per-requirement approve / request-changes with discussion |
| Milestones         | Weighted, ordered, client-visible or internal, with status and progress                                   |
| Tasks              | Work items grouped by functional team (never a named person), client-visible or internal                  |
| Progress Tracking  | Project progress is **derived** from weighted milestone progress — never stored or edited directly        |
| Project Updates    | Owner-posted updates, client-visible or internal                                                          |
| Change Requests    | Client-raised requests through a server-enforced lifecycle with attachments and a two-sided thread        |
| Notifications      | In-app feed and bell for both roles; each notification is addressed to one user                           |
| Files              | Scope files, SRS attachments, CR attachments — served only through authorised routes, no public URLs      |
| Audit Logs         | Every significant action recorded with actor, entity and non-secret metadata                              |

### Change request lifecycle

```
SUBMITTED → UNDER_REVIEW → CLARIFICATION_REQUIRED → UNDER_REVIEW
                        ↘ ACCEPTED → IN_PROGRESS → COMPLETED
                        ↘ DECLINED
```

Only owners transition a request. A client reply on a `CLARIFICATION_REQUIRED` request returns it to `UNDER_REVIEW`. Any
move not in `CR_TRANSITIONS` (`shared/delivery.ts`) is rejected with `409`.

### Weighted progress

`weightedProgress()` in `shared/delivery.ts` is the single source of truth for both roles:

```
progress = Σ(milestone.progress × weight) / Σ(weight)      (weights ≤ 0 ignored)
```

No milestones → `null`, rendered as "Not available yet" rather than a fake `0%`. `COMPLETED` forces `100`, `NOT_STARTED`
forces `0`. Stage is independent of progress and is set by the owner.

### Client privacy

Client payloads use explicit Prisma `select`s. A client never receives employee names or ids, assignee fields, internal
tasks, internal milestones, internal updates, audit metadata, or another tenant's data. Message authors are shown as
**Eiretech** or **Client** only.

## Local setup

Requires Node.js 22 and pnpm 9.

```bash
pnpm install
cp .env.example .env        # fill in DATABASE_URL, SESSION_SECRET, APP_URL
npx prisma generate
pnpm db:push                # sync the schema to your MongoDB database
pnpm db:seed                # local owner + two client tenants (see prisma/seed.mjs)
pnpm dev                    # http://localhost:3000
```

### Environment variables

Names only — real values live in `.env`, which is git-ignored and must never be committed.

| Variable         | Purpose                                               |
| ---------------- | ----------------------------------------------------- |
| `DATABASE_URL`   | MongoDB connection string including the database name |
| `SESSION_SECRET` | Random secret for session signing                     |
| `APP_URL`        | Public base URL used in links and emails              |
| `SMTP_HOST`      | Mail server host                                      |
| `SMTP_PORT`      | Mail server port                                      |
| `SMTP_USER`      | Mail username                                         |
| `SMTP_PASS`      | Mail password                                         |
| `SMTP_FROM`      | From address for outbound mail                        |

## Tests

The test suites are end-to-end HTTP matrices. They drive a running server with real cookie sessions — exactly as a
browser would — and verify authorisation, lifecycle rules and database state. They reset delivery data for the seeded
tenants, so run them against a development or staging database only.

Start the server first, then:

```bash
pnpm test:security     # auth, roles, sessions, privilege escalation, audit
pnpm test:scope        # scope questionnaire lifecycle + isolation
pnpm test:srs          # SRS authoring, send, per-requirement sign-off
pnpm test:delivery     # milestones, weighted progress, tasks, updates, CRs, notifications
pnpm test:isolation    # symmetric A→B / B→A exact-id probes + body tampering
```

Set `BASE=http://host:port` to point the suites at another server (for example a production build running locally).

```bash
pnpm typecheck         # vue-tsc, expected 0 errors
pnpm lint
```

## Production build

```bash
pnpm build
node .output/server/index.mjs
```

The runtime reads the same environment variables as development. Prisma's query engine is left external to the bundle
and resolved from `node_modules` at runtime.

### Deployment target

- **Hostinger Node.js** hosting for the application
- **MongoDB Atlas** for the database

### Known production considerations

- **File storage is local disk.** Uploads are written to `.data/uploads` on the application server. Persistent object
  storage (S3-compatible) is still required before production; only `server/services/storage.ts` needs to change.
- **SMTP is stubbed.** `server/services/mail.ts` logs password-reset links and welcome notices instead of sending them.
  Token generation, expiry and single-use rules are fully implemented; only transport is missing.
- **MongoDB credential rotation is required** before production. The Atlas password used during development must be
  rotated in Atlas and the new value placed in the production environment.
- `SESSION_SECRET` must be a fresh random value in production.

## Project history

| Phase   | Scope                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------- |
| 0 – 2.5 | Foundation: own backend, Prisma/MongoDB data model, authentication and sessions, owner console, client portal |
| 3       | Scope questionnaire, versions, discussions, approval                                                          |
| 4       | SRS / Requirements authoring, versioning, discussions, per-requirement approval                               |
| 5       | Delivery workspace: milestones, tasks, weighted progress, project updates, change requests, notifications     |

Phase 5 has been verified end to end (all five test matrices green against both the dev server and the production build,
typecheck clean, responsive at 1440 / 820 / 390) and is closed. Phase 6 — Trello integration — has not started.

## Licence

MIT. The project began from the AgencyOS starter (© 2023 Directus Community); its Directus backend and starter content
have since been removed entirely.
