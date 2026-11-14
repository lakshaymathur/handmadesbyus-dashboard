# Progress

_Last updated: 2026-11-14 · Keep this file under ~80 lines. Finished detail lives in git history._

## Current focus
**M4: Orders** (§2.4–2.6, §3.2). **Plan mode first** (CLAUDE.md): the user approves the approach before any code. M3 is done: product grid + filters, add/edit, photos, archive, duplicate, delete-if-unused, `/code-review` findings fixed.

## Next steps
1. **Plan M4 in plan mode**: read §2.4, §2.5, §2.6, §3.2 and the `orders`, `order_items`, `order_item_customisations`, `status_history` tables in `src/db/schema.ts`. Cover: create flow on a phone (customer pick/add, items, customisations, pricing, address snapshot), order code via `nextOrderCode(tx, orderDate)`, discounts, totals.
2. **Pricing logic** as pure functions with unit tests (CLAUDE.md): item = snapshot unit price + customisation prices × qty; flat and % discounts (basis points); shipping charged; never recompute from the catalogue.
3. **One status-change function** for order status and item stages that writes `status_history`, sets `delivered_date` on delivery and clears it when moving back (DB CHECK requires it).
4. Product picker uses `getProducts()` (active only by default) and offers only options linked to the product's category.
5. Customer page: fill in order history, lifetime spend and balance due (placeholder since M2).

## Milestones (MVP)
- [x] **M0** Project setup: scaffold, Docker, DB, auth, layout, lib helpers
- [x] **M1** Data model + Settings: full schema, managed lists, categories + production stages, customisation options, seed data (§2, §3.7)
- [x] **M2** Customers: list, search, detail, addresses, duplicate warnings (§2.1, §3.3)
- [x] **M3** Products: grid, CRUD, photos, archive, duplicate (§2.2, §3.4)
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
- Sizes are stored in whole mm and grams; percentages as basis points. The spec shows sizes in cm, so forms take cm and convert.
- **Customers**: the list is newest first (not by name). Country is always India (PINs are Indian; state is a dropdown of states/UTs). A customer keeps at least one address with exactly one default; deleting the default promotes the oldest other. Address changes lock the customer row (`FOR NO KEY UPDATE`). Mobile and Instagram handle are normalised (+91/0 stripped; @, case and profile links stripped; post links refused).
- Customers without a source (imports) show "Not recorded" and stay unset when edited; adding requires one.
- **Products**: product IDs stored in capitals, unique ignoring case. The list defaults to active products. Duplicate = Add form prefilled from `?from=` (no ID, no photos). Delete only if never ordered (FK); otherwise archive. Options Settings stops offering for a category may stay on existing products until unticked.
- **Photos**: shrunk in the browser to 1600 px JPEG (≤1.5 MB, quality lowered to fit; metadata dropped); server accepts JPEG/PNG/WebP by magic bytes; up to 5 per product. Served through `/api/photos/[id]` (session-checked, streamed, private cache, nosniff, sandbox CSP) instead of signed URLs, so S3 needn't be reachable from browsers. `serverActions.bodySizeLimit` is 2 MB and applies to every action.
- Phone testing on the LAN: add the dev server's Network URL to `TRUSTED_ORIGINS` in `.env`.
- GitHub: private repo `lakshaymathur/handmadesbyus-dashboard`. A repo-local git credential helper pushes as `lakshaymathur` whichever `gh` account is active.

## Known issues / TODO
- M8 import must advance `id_counters` past imported customer numbers and order codes.
- Consider a lint rule that every exported function in `features/*/queries.ts` calls `requireUser()`.
- `npm audit`: 7 moderate issues in `@typescript-eslint` (used only for linting, not shipped in the app). Recheck after dependency updates.
- When the startup env check fails, Next.js keeps running and returns 500s instead of exiting. Make it exit in the M9 Dockerfile (wrap `server.js`).
- Production migration strategy (when and how `db:migrate` runs on deploy) is undecided (M9).
- No security headers yet (CSP, `frame-ancestors`). Low risk because cookies are `SameSite=Lax`; add them in M9.
