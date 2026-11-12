# Progress

_Last updated: 2026-11-13 · Keep this file under ~80 lines. Finished detail lives in git history._

## Current focus
**M0: Project setup**, steps 1–3 done (scaffold, quality tooling, Docker). Next: Drizzle.

## Next steps
1. **Drizzle setup**: `src/db/client.ts` (reads `DATABASE_URL`), `drizzle.config.ts`, an empty `src/db/schema.ts`, migrate script, and the `db:generate` / `db:migrate` / `db:seed` / `db:reset` scripts from CLAUDE.md. Validate env vars with Zod at startup.
2. **Integration test wiring**: Vitest setup that migrates and truncates `TEST_DATABASE_URL`, one smoke `*.int.test.ts`, then drop `--passWithNoTests` from `test:integration` in `package.json`.
3. **Auth**: Better Auth with the username plugin, the `authedAction()` wrapper plus its lint rule (add a case to `eslint.config.test.ts`), a login page, a protected app layout with mobile nav, and a first-user seed. Add the auth env vars to `.env.example`.
4. **Lib helpers** with unit tests: `lib/money` (paise, ₹1,23,456), `lib/dates` (DD/MM/YYYY, IST), `lib/ids` (`C-0001`, `HMU-YYMM-####`), and `lib/storage` (S3 helper; AWS SDKs are lint-banned, so use a generic S3 client such as `minio`).
5. Close M0: try it at 375px, then run `/code-review` and `/security-review`, and fix the findings.

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
- Local S3 is **SeaweedFS** (`weed mini`), not MinIO: MinIO stopped publishing Docker images (chosen 2026-11-13).
- Integration tests (`*.int.test.ts`) may import the DB directly to seed and assert; the DB-import lint rule exempts them (kept 2026-11-13).
- Next 16 template defaults `cacheComponents` and `partialPrefetching` are left on: DB reads in pages will need `<Suspense>`.
- Quality controls approved 2026-11-13 (see CLAUDE.md). **Declined**: Playwright E2E tests, lint-on-edit hook, git pre-commit hook, GitHub Actions CI. Don't add these unless the user asks.

## Known issues / TODO
- `npm audit`: 7 moderate issues in `@typescript-eslint` (used only for linting, not shipped in the app). Recheck after dependency updates.
