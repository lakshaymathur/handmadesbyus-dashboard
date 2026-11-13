# Progress

_Last updated: 2026-11-14 · Keep this file under ~80 lines. Finished detail lives in git history._

## Current focus
**M2: Customers** (§2.1, §3.3). M1 is done: full schema with DB constraints, atomic ID counters, all Settings screens (lists, delivery partners, categories + stages, customisation options, general, users), sample data, `/code-review` findings fixed.

## Next steps
1. **Customers feature** in `src/features/customers/` (`schema.ts`, `queries.ts` with `requireUser()`, `actions.ts` with `authedAction()`), following `features/settings/` and `features/users/` patterns (`useActionForm`, `FormField`, `ManagedList`).
2. **List + search** (§3.3): name, mobile, Instagram handle; sort with `byName`; numbers via `nextCustomerNumber(tx)` inside the insert transaction, shown as `C-0001` (`lib/ids`).
3. **Detail + addresses** (§2.1): add/edit addresses, one default per customer (DB-enforced).
4. **Duplicate warnings** (§3.3): warn when the mobile or Instagram handle already exists (both UNIQUE in the DB); map 23505 to field errors with `uniqueViolation`.
5. Integration tests (`*.int.test.ts`) for every action; browser check at 375px; `/code-review`.

## Milestones (MVP)
- [x] **M0** Project setup: scaffold, Docker, DB, auth, layout, lib helpers
- [x] **M1** Data model + Settings: full schema, managed lists, categories + production stages, customisation options, seed data (§2, §3.7)
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
- Next 16 `cacheComponents` and `partialPrefetching` are on: route `params`, session reads and `usePathname()` must sit inside `<Suspense>`; no `generateStaticParams` on session pages.
- Quality controls approved 2026-11-13 (see CLAUDE.md). **Declined**: Playwright E2E tests, lint-on-edit hook, git pre-commit hook, GitHub Actions CI. Don't add these unless the user asks.
- **Sign-in brute force**: per-IP limit (Better Auth, 3/10s) plus a per-username cap (10 per 15 min, `src/db/sign-in-attempts.ts`), which also counts wrong current passwords in "Change password". An admin password reset lifts the lockout. Accepted trade-off: a known username can be locked out for up to 15 min.
- **Production must sit behind a reverse proxy**. `next start` refuses `x-forwarded-for` with empty `TRUSTED_PROXIES`, and refuses the example `BETTER_AUTH_SECRET`. To run `next start` locally, set `TRUSTED_PROXIES=::1`.
- **Users**: public sign-up is off; users are managed in Settings. Deactivation (not deletion) ends sessions and blocks sign-in; you can't deactivate yourself or the last active user, and you can't reset your own password (use "Change password").
- **Ordered lists** (list items, partners, categories, options, stages) serialise adds and moves with `pg_advisory_xact_lock` (`src/db/locks.ts`): `FOR UPDATE` locks nothing on an empty list.
- **Order delivered date**: DB CHECK `(status = 'delivered') = (delivered_date IS NOT NULL)`. The M4 status-change function must set it on delivery and clear it when an order moves back.
- Sizes are stored in whole mm and grams; percentages as basis points.
- GitHub: private repo `lakshaymathur/handmadesbyus-dashboard`. A repo-local git credential helper pushes as `lakshaymathur` whichever `gh` account is active.

## Known issues / TODO
- M8 import must advance `id_counters` past imported customer numbers and order codes.
- Consider a lint rule that every exported function in `features/*/queries.ts` calls `requireUser()`.
- `npm audit`: 7 moderate issues in `@typescript-eslint` (used only for linting, not shipped in the app). Recheck after dependency updates.
- When the startup env check fails, Next.js keeps running and returns 500s instead of exiting. Make it exit in the M9 Dockerfile (wrap `server.js`).
- Production migration strategy (when and how `db:migrate` runs on deploy) is undecided (M9).
- No security headers yet (CSP, `frame-ancestors`). Low risk because cookies are `SameSite=Lax`; add them in M9.
