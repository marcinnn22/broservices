# Contributing

By participating, you agree to follow the [Code of Conduct](./CODE_OF_CONDUCT.md). Report security
vulnerabilities privately according to [SECURITY.md](./SECURITY.md), never through a public issue or
pull request.

## Development setup

Use Node.js 24 and the pnpm version pinned in `package.json`.

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose up -d postgres mailpit
pnpm db:migrate
pnpm dev
```

Lefthook installs through the package `prepare` script. The pre-commit hook applies Biome fixes to
staged files and runs TypeScript; the pre-push hook runs tests and the production build.

## Contribution workflow

1. Fork the repository and create a focused branch from `main`.
2. Add tests and documentation with the implementation.
3. Run the local verification commands below.
4. Open a pull request using the repository template.

Do not mix unrelated refactors into a bug fix or feature change.

## Before opening a change

```bash
pnpm verify
pnpm db:check
```

Run PostgreSQL integration tests when persistence behavior changes:

```bash
docker compose --profile test up -d postgres-test
DATABASE_URL=postgresql://boilerplate:boilerplate@localhost:5433/boilerplate_test pnpm db:migrate
RUN_INTEGRATION_TESTS=true pnpm test:integration
```

## Architecture rules

- Put business behavior in the owning feature module.
- Domain and application code must not import Express or Drizzle.
- HTTP adapters call use cases, not repositories.
- Infrastructure adapters implement application ports.
- Add concrete wiring only in the composition root.
- Keep metric labels bounded and logs free of credentials and request bodies.
- Generate a new migration for schema changes; never rewrite shared migration history.
- Keep changes focused and include tests at the lowest useful boundary.

See [architecture.md](./architecture.md) for the rationale and diagrams.

## Commit hygiene

- Commit `pnpm-lock.yaml` with dependency changes.
- Commit generated Drizzle SQL and metadata with schema changes.
- Do not commit `.env`, credentials, local volumes, build output, or coverage output.
- Explain operational or security tradeoffs in the pull request.
