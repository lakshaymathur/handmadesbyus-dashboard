# Progress

_Last updated: 2026-11-13 · Keep this file under ~80 lines. Finished detail lives in git history._

## Current focus
**M0: Project setup** (not started)

## Next steps
1. Scaffold Next.js + TypeScript (strict + `noUncheckedIndexedAccess`) + Tailwind + shadcn/ui (`output: "standalone"`).
2. Quality tooling: ESLint + Prettier with the custom rules from CLAUDE.md, a `typecheck` script, Vitest (unit + integration configs). The Stop hook activates once `typecheck` exists.
3. `docker-compose.yml` with Postgres 17 (dev DB + test DB) and MinIO (data in `.docker-data/`), plus `.env.example`.
4. Drizzle setup (`src/db/client.ts`, config, migrate script) and the npm scripts from CLAUDE.md.
5. Better Auth with the username plugin, the `authedAction()` wrapper with its lint rule, a login page, a protected app layout with mobile nav, and a first-user seed.
6. `lib/money`, `lib/dates`, `lib/ids`, an S3 helper in `lib/storage`, with unit tests. Then run `/code-review` and `/security-review`.

## Milestones (MVP)
- [ ] **M0** Project setup: scaffold, Docker, DB, auth, layout, lib helpers
- [ ] **M1** Data model + Settings: full schema, managed lists, categories + production stages, customisation options, seed data (§2, §3.7)
- [ ] **M2** Customers: list, search, detail, addresses, duplicate warnings (§2.1, §3.3)
- [ ] **M3** Products: grid, CRUD, photos, archive, duplicate (§2.2, §3.4)
- [ ] **M4** Orders: create/detail, items, customisations, pricing, per-item stages, status history (§2.4–2.6, §3.2)
- [ ] **M5** Order dashboard: cards, filters, group-by, search, Kanban, quick actions (§3.1)
- [ ] **M6** Shipments + Payments (§2.7, §2.8, §3.5)
- [ ] **M7** Expenses + Financials (§2.9, §3.6)
- [ ] **M8** Spreadsheet import (§3.8)
- [ ] **M9** Polish: mobile pass, validation, audit fields, production Dockerfile, backup script

## Decisions not in the spec
- Production hosting is deliberately **undecided**. Keep everything portable (see CLAUDE.md hard rules).
- During development, real business data stays in the spreadsheet. The local DB is disposable.
- Quality controls approved 2026-11-13 (see CLAUDE.md). **Declined**: Playwright E2E tests, lint-on-edit hook, git pre-commit hook, GitHub Actions CI. Don't add these unless the user asks.

## Known issues / TODO
- (none)
