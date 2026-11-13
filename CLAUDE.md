# HandMadesByUs Dashboard

Internal web app for a small handmade-products business (Instagram-first, India): customers, products, orders, production stages, shipping, payments, expenses, financials. A few internal users, all with full access. Mobile-first.

@docs/PROGRESS.md

## Where things are
- **Spec**: `REQUIREMENTS.md`. Don't read the whole file; read only the section a task names (e.g. "§2.6"). Section 6 lists the final decisions.
- **Data model source of truth**: `src/db/schema.ts`. Read this instead of exploring the codebase to understand the data.
- **History**: `git log --oneline`. Commit messages say what was built and why.

## Stack
Next.js 16 (App Router; APIs differ from older versions, so check `node_modules/next/dist/docs/` per `AGENTS.md`) + TypeScript · Tailwind + shadcn/ui · PostgreSQL + Drizzle ORM · Better Auth (username + password) · S3 API for files via `aws4fetch` (SeaweedFS locally) · Zod · dnd-kit (Kanban) · Recharts · SheetJS (import). Package manager: npm.

## Commands
> Commands marked *(planned)* don't exist until milestone M0 is done. Update this list when they change.
- `cp .env.example .env` once, then `docker compose up -d --wait`: start Postgres 17 (dev + test DBs) and SeaweedFS S3 on localhost. Data in `.docker-data/` (delete it to start fresh)
- `npm run dev`: app at http://localhost:3000 · `npm run build`: standalone build in `.next/standalone`
- `npm run db:generate`: write a migration from `src/db/schema.ts` · `npm run db:migrate`: apply migrations · `npm run db:studio`: browse data
- `npm run db:seed`: create the first login user from `SEED_USER_*` (sample data from M1) · `npm run db:reset`: wipe + migrate + seed (refuses non-local hosts)
- `npm run lint` · `npm run typecheck` (`next typegen` + `tsc`) · `npm run format` / `format:check` (Markdown is excluded)
- `npm test`: unit tests · `npm run test:integration`: against the test Postgres (needs Docker up). Each run wipes and re-migrates `TEST_DATABASE_URL`; every test starts with empty tables; the app's `db` points at the test DB

## Folder layout (planned)
```
src/
  app/                 Next.js routes (thin: call into features/)
  features/<name>/     one folder per domain: customers, products, orders, shipments,
                       payments, expenses, financials, settings, import, auth
                       → actions.ts (server actions) · queries.ts · schema.ts (Zod) · components/
  components/ui/       shadcn/ui components
  db/                  schema.ts, migrations/, seed.ts, client.ts
  lib/                 shared helpers (money, dates, ids, storage, env)
  lib/auth/            server.ts (Better Auth) · session.ts (requireUser) · action.ts (authedAction) · client.ts
  proxy.ts             redirects visitors without a session cookie to /login (optimistic only)
eslint-rules/          custom lint rules (authed-action)
```

## Hard rules
- **Portability**: plain Postgres + S3 API only. No Supabase/Vercel/AWS-specific SDKs or features. All config comes from env vars, documented in `.env.example` and validated in `lib/env.ts` (add new ones to both).
- **Money**: store as integer **paise**. Format with `formatMoney`, parse form input with `moneyField()` (`lib/money`). Never use floating-point rupees.
- **Dates**: moments are `timestamptz`, shown with `formatDate`/`formatDateTime` (DD/MM/YYYY, IST). Calendar dates (delivered, expense date) are Postgres `date` / `"YYYY-MM-DD"` strings (`lib/dates`).
- **Files**: private bucket via `getStorage()` (`lib/storage`); keys from `newKey()`; show files with `signedUrl()`.
- **Snapshots**: order items copy unit price, unit cost and customisation prices at order time. Orders copy the delivery address. Never recompute history from the current catalogue.
- **Status changes** (order status and item production stage) always go through one function that also writes a `status_history` row.
- **No hard deletes** of used products/orders: archive or cancel instead. Every table has `created_at/by` and `updated_at/by` (except Better Auth's tables: users, sessions, accounts, verifications, rate_limits).
- **Validation**: one Zod schema per form, used by both the client and the server action.
- **Readable IDs**: customers `C-0001`, orders `HMU-YYMM-####` (IST month). Format/parse with `lib/ids`; numbers come from an atomic DB counter (M1).
- Production stages are configurable per product category. Fulfilment stages are fixed (see §2.6).
- Revenue is recognised on the **delivered date** (§3.6).

## Quality controls (approved 2026-11-13)
- **Database constraints** for every table: NOT NULL, foreign keys, UNIQUE (mobile, Instagram handle, product ID, AWB per partner), CHECK (qty ≥ 1, money ≥ 0, discount % 0–100, mobile 10 digits, PIN 6 digits).
- **TypeScript strict** + `noUncheckedIndexedAccess`. Don't use `any` or `@ts-ignore` without a comment explaining why.
- **ESLint + Prettier**, plus custom rules: no AWS/Supabase/Vercel SDK imports, and no `db`/`drizzle-orm` imports outside `src/db`, `features/*/queries.ts`, `features/*/actions.ts`, `*.int.test.ts` and `src/lib/auth/server.ts` (type-only imports are fine). `eslint.config.test.ts` checks these rules fire. `eslint-disable` and `@ts-ignore` need a `-- reason`.
- **Every server action uses `authedAction()`** (`@/lib/auth/action`): it requires login, validates input with Zod, and passes audit fields. The `local/authed-action` lint rule enforces this.
- **Every query that returns data calls `requireUser()`** (`@/lib/auth/session`). Layouts and `proxy.ts` don't protect data: Next.js renders pages independently of their layout.
- **Tests**: Vitest unit tests for all money, pricing, status-transition, revenue and import logic (`*.test.ts` next to the code). Integration tests for server actions against the real test Postgres (`*.int.test.ts`). No E2E tests.
- **Stop hook** (`.claude/hooks/typecheck-on-stop.sh`): Claude can't end a turn while `npm run typecheck` fails.
- **Definition of done for a milestone**: tests written and passing, typecheck and lint clean, the feature tried in the built-in browser at phone width (375px), and `/code-review` run on the milestone's changes with findings fixed.
- **`/security-review`** at the end of M0 (auth) and M8 (import).
- **Plan mode first** for M4 Orders, M5 Dashboard, M7 Financials and M8 Import: the user approves the approach before any code is written.

## Working style
- **Start of session**: run `docker compose up -d --wait` before anything that needs the database or file storage (dev server, integration tests). `/wrap-session` stops them again.
- One task per session where possible. Read only the files the task needs.
- Before ending a session, the user runs `/wrap-session` to update `docs/PROGRESS.md` and commit.
- Keep this file and PROGRESS.md short. Detail belongs in code, the spec, or git history.
