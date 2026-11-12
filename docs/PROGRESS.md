# Progress

_Last updated: 2026-11-13 · Keep this file under ~80 lines. Finished detail lives in git history._

## Current focus
**M0: Project setup** (not started)

## Next steps
1. Scaffold Next.js + TypeScript + Tailwind + shadcn/ui (`output: "standalone"`).
2. `docker-compose.yml` with Postgres 17 + MinIO (data in `.docker-data/`), plus `.env.example`.
3. Drizzle setup (`src/db/client.ts`, config, migrate script) and npm scripts from CLAUDE.md.
4. Better Auth with the username plugin, a login page, a protected app layout with mobile nav, and a first-user seed.
5. `lib/money`, `lib/dates`, `lib/ids`, and an S3 storage helper in `lib/storage`.

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

## Known issues / TODO
- (none)
