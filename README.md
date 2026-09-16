# Eiretech Client Portal

Client management and client-facing delivery portal for Eiretech. Owners onboard clients, agree scope and requirements
with them, and run delivery in the open; clients follow their project, sign off on each stage, and raise change requests
— all inside one tenant-isolated application.

The application runs on its **own backend**. Directus has been completely removed; there is no external CMS, BaaS or
admin framework in the stack.

## Architecture

| Layer      | Technology                                                                 |
| ---------- | -------------------------------------------------------------------------- |
| UI         | Nuxt 3 / Vue 3, Nuxt UI 2, Tailwind CSS                                    |
| API        | Nuxt Server API (Nitro / h3 route handlers under `server/api`)             |
| Data       | Prisma 6 → MongoDB Atlas                                                   |
| Passwords  | Argon2id (`@node-rs/argon2`)                                               |
| Sessions   | Database-backed, opaque id in an `httpOnly` cookie (`eiretech_session`)    |
| Validation | Zod on every mutating route; every environment variable validated at boot  |
| Mail       | Nodemailer over SMTP (`server/services/mail/`); logged locally when unset  |
| Files      | Storage boundary (`server/services/storage/`): local disk or S3-compatible |
| Runtime    | Security headers, rate limiting, error redaction, `/api/health`            |

```
pages/ + layers/portal/        Vue pages: owner console (/admin) and client portal (/portal)
components/                    Shared UI (workspace tabs, milestone list, CR threads, SRS review…)
server/api/                    HTTP routes, split admin/* (OWNER) and portal/* (CLIENT)
server/services/               Business logic, audit, notifications, mail/, storage/
server/utils/auth.ts           requireUser / requireOwner / requireClient, sessions, tokens
server/utils/env.ts            Environment schema; the server refuses to boot on a bad value
server/utils/rate-limit*.ts    In-memory rate limiting for auth and upload routes
server/middleware/             Security headers (CSP, HSTS, nosniff, frame deny ...)
server/plugins/                Boot order: env validation -> error redaction -> headers
shared/                        Rules shared by client and server (progress formula, CR transitions, templates)
prisma/schema.prisma           Data model
scripts/unit/*.test.mjs        Unit tests (env, mail, security, storage) - no server needed
scripts/*-matrix.mjs           End-to-end HTTP test suites
scripts/bootstrap-owner.mjs    Create the first production OWNER
scripts/purge-dev-data.mjs     Remove seeded / test data before go-live
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
| Authentication     | Sign-in, invitation activation, forgot/reset with single-use expiring tokens, suspension, rate limiting   |
| Clients            | Organisation + primary contact onboarding by invitation, access reset (re-invite)                         |
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

### Client onboarding

No credential is ever created for, shown to, or sent to a client. The flow is:

```
Owner creates Client
  -> account stored with an unusable random password (Argon2id hash only)
  -> single-use INVITE token issued (72 h, only its SHA-256 hash is stored)
  -> invitation email sent; when SMTP is not configured the setup link is
     returned to the Owner exactly once so it can be passed on by another channel
  -> Client opens the link and chooses their own password
  -> token consumed, every other session for the account revoked
  -> Client signs in
```

"Reset access" on a client locks the account again (fresh unusable password, all sessions revoked, any earlier unused
invitation burned) and issues a new invitation. Forgot-password uses the same token table with `purpose = RESET` and a
one-hour expiry. A token is rejected once used, once expired, or once superseded.

### Client privacy

Client payloads use explicit Prisma `select`s. A client never receives employee names or ids, assignee fields, internal
tasks, internal milestones, internal updates, audit metadata, or another tenant's data. Message authors are shown as
**Eiretech** or **Client** only.

## Local setup

Requires **Node.js >= 22.6** and **pnpm >= 9** (enforced by `engines` in `package.json`).

```bash
pnpm install
cp .env.example .env        # fill in DATABASE_URL, SESSION_SECRET, APP_URL
npx prisma generate
pnpm db:push                # sync the schema to your MongoDB database (Prisma db push; no migrations on Mongo)
pnpm db:seed                # local owner + two client tenants (see prisma/seed.mjs)
pnpm dev                    # http://localhost:3000
```

To inspect outgoing email locally, run the server with `MAIL_OUTBOX_FILE=.data/outbox.jsonl`; every message is appended
as one JSON line. This setting is refused in production.

### Environment variables

Names only — real values live in `.env`, which is git-ignored and must never be committed. Every variable is validated
by `server/utils/env.ts` at boot; a missing or malformed value stops the server and names the variable without printing
its value.

| Variable              | Purpose                                                                     |
| --------------------- | --------------------------------------------------------------------------- |
| `NODE_ENV`            | `development` or `production`. Production enforces the stricter rules below |
| `DATABASE_URL`        | MongoDB connection string including the database name                       |
| `SESSION_SECRET`      | Random secret, at least 32 characters in production                         |
| `APP_URL`             | Public base URL used in links and emails; warns if not public `https://`    |
| `HOST` / `PORT`       | Listen address for the built server (Hostinger sets these)                  |
| `SMTP_HOST`           | Mail server host. Setting it switches on real delivery                      |
| `SMTP_PORT`           | Mail server port (default 587)                                              |
| `SMTP_SECURE`         | `true` for implicit TLS on 465, `false` for STARTTLS on 587                 |
| `SMTP_USER`           | Mail username                                                               |
| `SMTP_PASS`           | Mail password                                                               |
| `SMTP_FROM`           | From address for outbound mail                                              |
| `MAIL_OUTBOX_FILE`    | Development only: append every message as JSON to this file                 |
| `STORAGE_DRIVER`      | `local` (development) or `s3` (production)                                  |
| `STORAGE_ROOT`        | Directory for the `local` driver (default `.data/uploads`)                  |
| `S3_BUCKET`           | Private bucket name                                                         |
| `S3_REGION`           | e.g. `eu-west-1` for AWS, `auto` for Cloudflare R2                          |
| `S3_ENDPOINT`         | Required for non-AWS providers (R2, B2, Spaces, MinIO)                      |
| `S3_ACCESS_KEY`       | Object storage access key                                                   |
| `S3_SECRET_KEY`       | Object storage secret key                                                   |
| `S3_FORCE_PATH_STYLE` | `true` for providers that need path-style URLs                              |

### Storage

Business logic only ever sees an opaque, random, tenant-prefixed `storageKey`; where the bytes live is decided once,
from configuration. Nothing in either driver is publicly reachable: bytes leave the system only through an authorised
API route, as an `attachment` with `nosniff`.

```
Development:  STORAGE_DRIVER=local     files under STORAGE_ROOT on the app server
Production:   STORAGE_DRIVER=s3        any S3-compatible PRIVATE bucket (AWS S3, Cloudflare R2, Backblaze B2, MinIO ...)
```

Every upload is validated before a byte is stored: MIME allow-list (no SVG, no HTML), extension must match the declared
type, magic bytes must match where the format has them, 15 MB cap, filename sanitised.

## Tests

The test suites are end-to-end HTTP matrices. They drive a running server with real cookie sessions — exactly as a
browser would — and verify authorisation, lifecycle rules and database state. They reset delivery data for the seeded
tenants, so run them against a development or staging database only.

```bash
pnpm test:unit         # no server needed: env schema, mail templates/transports, rate limiter, storage drivers
```

Start the server first (ideally with `MAIL_OUTBOX_FILE` set so the production suite can inspect emails), then:

```bash
pnpm test:security     # auth, roles, sessions, invitations, privilege escalation, audit
pnpm test:scope        # scope questionnaire lifecycle + isolation
pnpm test:srs          # SRS authoring, send, per-requirement sign-off
pnpm test:delivery     # milestones, weighted progress, tasks, updates, CRs, notifications
pnpm test:isolation    # symmetric A→B / B→A exact-id probes + body tampering
pnpm test:production   # health, headers, cookie policy, rate limits, session revocation, upload hardening, emails
pnpm test:all          # everything above, in order
```

Set `BASE=http://host:port` to point the suites at another server (for example a production build running locally). Rate
limits are per process and `test:production` deliberately exhausts several of them, so restart the server before running
it a second time within 15 minutes; a `429` on the second pass is the limiter working.

```bash
pnpm typecheck         # vue-tsc, expected 0 errors
pnpm lint              # eslint 9 flat config, expected 0 errors / 0 warnings
```

Continuous integration (`.github/workflows/ci.yaml`) runs typecheck, lint, unit tests and a production build on every
push and pull request to `main`. It uses placeholder environment values only and never reaches a live database, mail
server or bucket.

## Operations

```bash
pnpm db:push                    # apply prisma/schema.prisma to the configured database
pnpm bootstrap:owner            # create the first OWNER (OWNER_EMAIL / OWNER_NAME / OWNER_PASSWORD, or prompted)
pnpm purge:dev-data             # dry run: list seeded / test records that would be removed
pnpm purge:dev-data --confirm   # remove them (refuses under NODE_ENV=production unless ALLOW_DEV_DATA=1)
curl https://<host>/api/health  # {"status":"ok","database":"up"}; 503 when the database is unreachable
```

Nothing operational is hard-coded: no default accounts exist in the runtime, and `bootstrap:owner` never prints the
password it was given.

## Production build

```bash
pnpm build
node .output/server/index.mjs        # honours HOST / PORT; NODE_ENV=production assumed when unset
```

The runtime reads the same environment variables as development. Prisma's query engine is left external to the bundle
and resolved from `node_modules` at runtime.

In production the session cookie is `Secure`, `HttpOnly`, `SameSite=Lax`; `Strict-Transport-Security` and a
`Content-Security-Policy` are sent, and errors are redacted to their status text. Because the cookie is `Secure`, a
production build served over plain `http://` from anything other than `localhost` cannot keep a session. This is by
design, not a bug: put it behind TLS.

### Deployment target

- **Hostinger Node.js** hosting for the application (TLS terminated by the host)
- **MongoDB Atlas** for the database
- Any **S3-compatible private bucket** for files

### Production checklist

Each item is an external action; none is complete until it has actually been done in the target environment.

- [ ] Rotate the MongoDB Atlas password that was used during development; never reuse it
- [ ] `DATABASE_URL` set to the production cluster and database
- [ ] `SESSION_SECRET` freshly generated, 32+ characters
- [ ] `APP_URL` set to the public `https://` origin
- [ ] `NODE_ENV=production`
- [ ] SMTP configured (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`)
- [ ] Private S3-compatible bucket created; `STORAGE_DRIVER=s3` with `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`,
      `S3_ACCESS_KEY`, `S3_SECRET_KEY`
- [ ] `MAIL_OUTBOX_FILE` **not** set
- [ ] `pnpm db:push` run against the production database
- [ ] `pnpm bootstrap:owner` run to create the production Owner
- [ ] `pnpm purge:dev-data --confirm` run if the database ever held seed or test data
- [ ] `GET /api/health` returns `200` with `database: up` through the public URL
- [ ] Create a test client and confirm the invitation email arrives and activates the account
- [ ] Forgot-password email arrives and the link works once
- [ ] Upload a file as a client and download it as the Owner (confirms the bucket credentials)
- [ ] MongoDB Atlas backups enabled and a restore tested
- [ ] Object-storage versioning or backup enabled

## Project history

| Phase   | Scope                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------- |
| 0 – 2.5 | Foundation: own backend, Prisma/MongoDB data model, authentication and sessions, owner console, client portal |
| 3       | Scope questionnaire, versions, discussions, approval                                                          |
| 4       | SRS / Requirements authoring, versioning, discussions, per-requirement approval                               |
| 5       | Delivery workspace: milestones, tasks, weighted progress, project updates, change requests, notifications     |

| 6 | Production hardening: env validation, SMTP mail, S3 storage, invitations, rate limiting, headers, CI, ops |

Phase 6 has been verified end to end (unit tests plus all six HTTP matrices green against a fresh server, typecheck and
lint clean, production build boots) and is closed. Real SMTP and S3 credentials are configured at deployment time, not
in the repository. Trello integration has not started.

## Licence

MIT. The project began from the AgencyOS starter (© 2023 Directus Community); its Directus backend and starter content
have since been removed entirely.
