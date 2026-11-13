# Progress

_Last updated: 2026-11-13 · Keep this file under ~80 lines. Finished detail lives in git history._

## Current focus
**M1: Data model + Settings** (§2, §3.7). M0 is done: scaffold, Docker, Drizzle, test harness, auth, layout, lib helpers, `/code-review` and `/security-review` fixed.

## Next steps
1. **Full schema** in `src/db/schema.ts` from §2.1–2.9: customers, addresses, products, categories, production stages (per category), customisation options, orders, order items (price/cost/customisation snapshots), status_history, shipments, payments, expenses, managed lists. Audit columns on every table and the DB constraints from CLAUDE.md "Quality controls". Then `npm run db:generate`.
2. **Atomic ID counters** for `C-0001` and `HMU-YYMM-####` (a counters table with `UPDATE … RETURNING`), wired to `lib/ids`, with an integration test for concurrent allocation.
3. **Settings screens** (§3.7): managed lists, categories + their production stages, customisation options. Add a `features/settings/` folder with `queries.ts` (calls `requireUser()`), `actions.ts` (`authedAction()`), and Zod schemas.
4. **Seed sample data** in `src/db/seed.ts` (categories, stages, a few products/customers), only on databases marked `disposable-local`.
5. Consider a lint rule that every exported function in `features/*/queries.ts` calls `requireUser()`.

## Milestones (MVP)
- [x] **M0** Project setup: scaffold, Docker, DB, auth, layout, lib helpers
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
- Local S3 is **SeaweedFS** (`weed mini`), not MinIO: MinIO stopped publishing Docker images. The S3 client is `aws4fetch` (AWS SDKs are lint-banned).
- Integration tests (`*.int.test.ts`) may import the DB directly to seed and assert; the DB-import lint rule exempts them.
- Next 16 template defaults `cacheComponents` and `partialPrefetching` are left on: DB reads in pages will need `<Suspense>`.
- Quality controls approved 2026-11-13 (see CLAUDE.md). **Declined**: Playwright E2E tests, lint-on-edit hook, git pre-commit hook, GitHub Actions CI. Don't add these unless the user asks.
- **Sign-in brute force**: per-IP limit (Better Auth, 3/10s) plus a per-username cap (10 per 15 min, `src/db/sign-in-attempts.ts`). Accepted trade-off: a known username can be locked out for up to 15 min.
- **Production must sit behind a reverse proxy**. `next start` refuses `x-forwarded-for` with empty `TRUSTED_PROXIES`, and refuses the example `BETTER_AUTH_SECRET`. To run `next start` locally, set `TRUSTED_PROXIES=::1`.
- Public sign-up is off. Users are created by the seed now, and from Settings later.
- GitHub: private repo `lakshaymathur/handmadesbyus-dashboard`. A repo-local git credential helper pushes as `lakshaymathur` whichever `gh` account is active.

## Known issues / TODO
- `npm audit`: 7 moderate issues in `@typescript-eslint` (used only for linting, not shipped in the app). Recheck after dependency updates.
- When the startup env check fails, Next.js keeps running and returns 500s instead of exiting. Make it exit in the M9 Dockerfile (wrap `server.js`).
- Production migration strategy (when and how `db:migrate` runs on deploy) is undecided (M9).
- No security headers yet (CSP, `frame-ancestors`). Low risk because cookies are `SameSite=Lax`; add them in M9.
