# Express + PostgreSQL Boilerplate

[![CI](https://github.com/mzubair481/express-boilerplate/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/mzubair481/express-boilerplate/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/github/license/mzubair481/express-boilerplate)](./LICENSE)
[![Node.js 24+](https://img.shields.io/badge/Node.js-24%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![pnpm 11](https://img.shields.io/badge/pnpm-11-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)

![Express and PostgreSQL production-ready API boilerplate](./assets/social-preview.png)

A clean-slate, production-oriented API boilerplate built with Express 5, TypeScript, PostgreSQL,
and Drizzle. It uses a modular monolith, feature-first folders, ports and adapters at useful
boundaries, and a manual composition root.

This repository does not contain a legacy compatibility layer. PostgreSQL and the committed Drizzle
migrations are the source of truth.

## System at a glance

```mermaid
flowchart LR
    Client["Web / mobile / API client"]

    subgraph API["Node.js 24 API"]
      Express["Express HTTP adapters"]
      Auth["Auth use cases"]
      Users["User use cases"]
      Root["Manual composition root"]
      Observe["Pino + Prometheus metrics"]

      Root -. wires .-> Express
      Root -. wires .-> Auth
      Root -. wires .-> Users
      Express --> Auth
      Express --> Users
      Express -. telemetry .-> Observe
    end

    Repositories["Drizzle repository adapters"]
    PostgreSQL[("PostgreSQL 18")]
    Mail["SMTP / Mailpit"]
    Prometheus["Prometheus"]
    Grafana["Grafana"]
    Alertmanager["Alertmanager"]

    Client --> Express
    Auth --> Repositories
    Users --> Repositories
    Repositories --> PostgreSQL
    Auth --> Mail
    Observe --> Prometheus
    Prometheus --> Grafana
    Prometheus --> Alertmanager
```

Read [architecture.md](./architecture.md) for visual request flows, dependency rules, alternatives,
and architectural tradeoffs.

## Included

- Express 5 with strict Zod request validation and stable response envelopes.
- PostgreSQL 18, Drizzle ORM, and reviewed Drizzle Kit migrations.
- Registration, email verification, login, password reset, user administration, and role/status
  changes.
- Short-lived JWT access tokens.
- Rotating opaque refresh tokens stored only as SHA-256 hashes, with family-level reuse detection.
- A short concurrent-refresh grace window that preserves the winning rotated session.
- PostgreSQL-backed password-reset and verification-email requests with retries and recipient
  cooldowns.
- HttpOnly refresh cookies, a 12-character/four-class password policy, native asynchronous Argon2id
  hashing, strict CSP, clickjacking/feature-policy headers, CORS, and co-located route rate limits.
- Manual constructor injection in one composition root—no decorators or service locator.
- Pino structured logging with recursive secret, URL-query, and embedded SQL-parameter redaction.
- Request IDs backed by `AsyncLocalStorage`.
- Prometheus HTTP, database, runtime, and garbage-collection metrics.
- Separate liveness and PostgreSQL-backed readiness checks.
- Grafana provisioning, recording rules, alerts, and an authenticated Alertmanager webhook.
- OpenAPI 3.1 with an interactive Scalar API reference.
- Vitest unit tests, Supertest HTTP tests, and opt-in PostgreSQL integration tests.
- pnpm 11, Biome 2, Lefthook 2, strict TypeScript, Docker Compose, and GitHub Actions.

## Quick start

Select **Use this template** on GitHub to create a repository without inheriting this project’s Git
history, then clone your new repository.

Requirements:

- Node.js 24
- Corepack
- Docker with Docker Compose

```bash
corepack enable
cp .env.example .env
pnpm install
docker compose up -d postgres mailpit
pnpm db:migrate
pnpm dev
```

If host port `5432` is already occupied, start PostgreSQL with
`POSTGRES_PORT=55432 docker compose up -d postgres` and use port `55432` in `DATABASE_URL`.

The default local services are:

| Service | URL |
|---|---|
| API | `http://localhost:4300/api/v1` |
| API reference | `http://localhost:4300/docs` |
| Readiness | `http://localhost:4300/monitoring/readiness` |
| Prometheus metrics | `http://localhost:4300/monitoring/metrics` (Bearer token required) |
| Mailpit | `http://localhost:8025` |

To start the complete containerized stack:

```bash
docker compose up --build
```

This additionally starts Prometheus on port `9090`, Alertmanager on `9093`, and Grafana on `3000`.
The local Grafana credentials are `admin` / `admin`; change them anywhere beyond local development.

## Authentication flow

```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant API
    participant PostgreSQL

    Client->>API: POST /auth/login
    API->>PostgreSQL: Check user + password
    API->>PostgreSQL: Store hash of opaque refresh token
    API-->>Client: JWT access token + HttpOnly refresh cookie
    Client->>API: Request with Bearer access token
    API->>PostgreSQL: Check user, auth version, and session
    API-->>Client: Protected response
    Client->>API: POST /auth/refresh with cookie
    API->>PostgreSQL: Atomically revoke old token and insert replacement
    API-->>Client: New access token + rotated cookie
```

Refresh tokens never enter the JSON response or the database in plaintext. Password, role, status,
and logout-all changes invalidate existing credentials through an incrementing auth version.

## API surface

All application routes use the configured `API_PREFIX`, `/api/v1` by default.

| Method | Path | Access |
|---|---|---|
| `POST` | `/auth/register` | Public |
| `POST` | `/auth/login` | Public |
| `POST` | `/auth/refresh` | Refresh cookie |
| `POST` | `/auth/logout` | Refresh cookie |
| `POST` | `/auth/logout-all` | Bearer token |
| `POST` | `/auth/email/verify` | Public action token |
| `POST` | `/auth/email/resend` | Public, uniform response |
| `POST` | `/auth/password/forgot` | Public, uniform response |
| `POST` | `/auth/password/reset` | Public action token |
| `GET/PATCH` | `/users/me` | Bearer token |
| `GET` | `/users` | Administrator |
| `GET/PATCH` | `/users/:userId` | Owner or administrator |
| `PATCH` | `/users/:userId/role` | Administrator |
| `PATCH` | `/users/:userId/status` | Administrator |

Example requests are in [requests/api.http](./requests/api.http).

## Commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Start the API with TypeScript watch mode |
| `pnpm build` | Compile production JavaScript and declarations |
| `pnpm start` | Run the compiled API |
| `pnpm check` | Check formatting, lint rules, and import organization |
| `pnpm check:fix` | Apply safe Biome fixes |
| `pnpm typecheck` | Run strict TypeScript without emitting |
| `pnpm test` | Run unit and HTTP tests |
| `pnpm test:coverage` | Run tests with enforced coverage thresholds |
| `pnpm test:integration` | Run opt-in PostgreSQL integration tests |
| `pnpm db:generate` | Generate a migration from schema changes |
| `pnpm db:check` | Validate migration metadata |
| `pnpm db:migrate` | Apply committed migrations |
| `pnpm db:studio` | Open Drizzle Studio |
| `pnpm seed` | Create the configured initial administrator |
| `pnpm verify` | Run the complete local verification sequence |

For integration tests:

```bash
docker compose --profile test up -d postgres-test
DATABASE_URL=postgresql://boilerplate:boilerplate@localhost:5433/boilerplate_test pnpm db:migrate
RUN_INTEGRATION_TESTS=true pnpm test:integration
```

The test service uses a separate database instance and volume so queue workers and maintenance jobs
cannot mutate development data. Its connection URL is the default in `.env.test`.

## Project layout

```text
src/
├── bootstrap/                 # composition root, Express app, server, shutdown
├── modules/
│   ├── auth/
│   │   ├── application/       # use cases and required ports
│   │   ├── domain/            # auth rules and errors
│   │   ├── http/              # validation, middleware, routes, OpenAPI
│   │   └── infrastructure/    # Drizzle, JOSE, Argon2id, tokens, email
│   ├── users/
│   └── monitoring/
└── platform/
    ├── config/
    ├── database/
    ├── http/
    └── observability/
```

Dependencies point inward: HTTP and infrastructure know application ports; domain and application
code do not know Express or Drizzle. Concrete implementations meet only in
[`src/bootstrap/composition-root.ts`](./src/bootstrap/composition-root.ts).

## Database workflow

1. Edit the owning module’s `*.schema.ts`.
2. Run `pnpm db:generate`.
3. Review the generated SQL and metadata.
4. Run unit and PostgreSQL integration tests.
5. Apply with `pnpm db:migrate`.

Do not edit a migration that has already been applied to a shared environment. The API deliberately
does not migrate during startup; the Compose `migrate` service and deployment pipeline own that step.

## Configuration and security

Configuration is parsed once at startup and fails fast with variable names—not secret values—when
invalid. See [.env.example](./.env.example) for every setting.

Before production:

- Generate a unique `JWT_ACCESS_SECRET` of at least 32 bytes.
- Generate a separate `METRICS_BEARER_TOKEN` of at least 32 bytes.
- Use a managed PostgreSQL account with least-privilege credentials and TLS as required.
- Set `PUBLIC_URL`, exact `CORS_ORIGINS`, `TRUST_PROXY`, and secure cookie settings for the real
  proxy topology.
- Keep `REFRESH_COOKIE_SAME_SITE=strict` unless the browser deployment requires another policy.
- Use a real SMTP provider; registration, verification-resend, and password-reset delivery already
  use the PostgreSQL-backed retry queue. Keep its connection, greeting, and socket timeouts below the
  total graceful-shutdown deadline.
- Replace the local metrics token, Alertmanager token, and Grafana credentials.
- Restrict the metrics, dashboards, and API-reference endpoints at the network layer.
- Back rate limiting with a shared store when running more than one API replica.
- Keep generated SQL, lockfile changes, and dependency-audit results in code review.

## Monitoring

| Endpoint | Meaning |
|---|---|
| `/monitoring/liveness` | The Node.js process is alive; no dependency calls |
| `/monitoring/readiness` | Required dependencies, currently PostgreSQL, are ready; checks are briefly cached and coalesced |
| `/monitoring/health` | Aggregate human-readable health using the same bounded readiness result |
| `/monitoring/metrics` | Bearer-authenticated Prometheus text exposition |
| `/monitoring/alerts` | Authenticated Alertmanager webhook |

Metric labels use normalized route templates such as `/users/:userId`, never raw IDs or URLs. The
logger recursively redacts credentials, cookies, passwords, secrets, token-like fields, and sensitive
URL query parameters. Drizzle `params:` lines are redacted from error messages and stacks before
they reach Pino or seed-command output.

Login and refresh failures have dedicated limiters that do not penalize successful requests.
Registration, verification, resend, and password-reset calls always count toward the public-auth
limit. Verification resends additionally pass both a per-client cap and a hashed
client-and-recipient cap, so rotating addresses cannot evade the former and one client cannot spend
another client's latter quota. Feature routers attach these policies directly to their route
declarations. Registration, resend, and reset delivery is durably queued with owner-checked
PostgreSQL leases, and the uniform resend/reset `202` paths do no account lookup or SMTP work, so
account state is not exposed through response timing.
Liveness and readiness bypass request quotas so orchestrator probes cannot restart-loop a healthy
pod; readiness dependency work is coalesced and briefly cached. The remaining monitoring endpoints
have an independent quota. Expired refresh sessions and action tokens are removed at startup and
periodically according to `AUTH_CLEANUP_INTERVAL`.

Password reset commits token consumption, password/auth-version update, and refresh-session
revocation in one PostgreSQL transaction. The password-changed email is sent only after commit and
cannot turn a completed reset into a failure response.

## Contributing, support, and security

- Read [CONTRIBUTING.md](./CONTRIBUTING.md) before proposing a change.
- Use [GitHub Discussions](https://github.com/mzubair481/express-boilerplate/discussions) for usage
  questions and [GitHub Issues](https://github.com/mzubair481/express-boilerplate/issues) for
  reproducible defects.
- Report vulnerabilities privately by following [SECURITY.md](./SECURITY.md).

Maintained by [M Zubair](https://github.com/mzubair481).

## License

MIT. See [LICENSE](./LICENSE).
