# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-07-27

### Added

- Modular-monolith architecture with feature-first auth, users, and monitoring modules.
- Manual constructor injection through a single composition root.
- PostgreSQL 18 persistence with Drizzle ORM and reviewed Drizzle Kit migrations.
- Argon2id password hashing, rotating opaque refresh tokens, durable auth-email queues, and atomic
  security-sensitive state transitions.
- OpenAPI 3.1 documentation, strict request validation, structured logging, Prometheus metrics,
  Grafana dashboards, Alertmanager rules, and bounded health probes.
- Vitest unit, HTTP, and PostgreSQL integration suites; Biome; Lefthook; pnpm; and production
  container verification in GitHub Actions.

### Changed

- Replaced the former Prisma/Jest/npm implementation with the clean-slate TypeScript architecture.
- Renamed the default branch from `master` to `main`.

### Removed

- Legacy compatibility code, Prisma artifacts, Jest configuration, npm lockfiles, old Compose files,
  and ad hoc battle-test scripts.

[2.0.0]: https://github.com/mzubair481/express-boilerplate/releases/tag/v2.0.0
