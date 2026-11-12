# HandMadesByUs Dashboard

Internal web app for a small handmade-products business (Instagram-first, India): customers, products, orders, production stages, shipping, payments, expenses, financials. A few internal users, all with full access. Mobile-first.

@docs/PROGRESS.md

## Where things are
- **Spec**: `REQUIREMENTS.md`. Don't read the whole file; read only the section a task names (e.g. "§2.6"). Section 6 lists the final decisions.
- **Data model source of truth**: `src/db/schema.ts`. Read this instead of exploring the codebase to understand the data.
- **History**: `git log --oneline`. Commit messages say what was built and why.

## Stack
Next.js (App Router) + TypeScript · Tailwind + shadcn/ui · PostgreSQL + Drizzle ORM · Better Auth (username + password) · S3 API for files (MinIO locally) · Zod · dnd-kit (Kanban) · Recharts · SheetJS (import). Package manager: npm.

## Commands
> Commands marked *(planned)* don't exist until milestone M0 is done. Update this list when they change.
- `docker compose up -d`: start Postgres + MinIO *(planned)*
- `npm run dev`: app at http://localhost:3000 *(planned)*
- `npm run db:generate` / `npm run db:migrate`: Drizzle migrations *(planned)*
- `npm run db:seed`: load sample data · `npm run db:reset`: wipe + migrate + seed *(planned)*
- `npm run lint` · `npm run typecheck` · `npm test` *(planned)*

## Folder layout (planned)
```
src/
  app/                 Next.js routes (thin: call into features/)
  features/<name>/     one folder per domain: customers, products, orders, shipments,
                       payments, expenses, financials, settings, import, auth
                       → actions.ts (server actions) · queries.ts · schema.ts (Zod) · components/
  components/ui/       shadcn/ui components
  db/                  schema.ts, migrations/, seed.ts, client.ts
  lib/                 shared helpers (money, dates, ids, storage, auth)
```

## Hard rules
- **Portability**: plain Postgres + S3 API only. No Supabase/Vercel/AWS-specific SDKs or features. All config comes from env vars, documented in `.env.example`.
- **Money**: store as integer **paise**. Format with `lib/money` (₹1,23,456). Dates are shown as DD/MM/YYYY in IST.
- **Snapshots**: order items copy unit price, unit cost and customisation prices at order time. Orders copy the delivery address. Never recompute history from the current catalogue.
- **Status changes** (order status and item production stage) always go through one function that also writes a `status_history` row.
- **No hard deletes** of used products/orders: archive or cancel instead. Every table has `created_at/by` and `updated_at/by`.
- **Validation**: one Zod schema per form, used by both the client and the server action.
- **Readable IDs**: customers `C-0001`, orders `HMU-YYMM-####`.
- Production stages are configurable per product category. Fulfilment stages are fixed (see §2.6).
- Revenue is recognised on the **delivered date** (§3.6).

## Working style
- One task per session where possible. Read only the files the task needs.
- Before ending a session, the user runs `/wrap-session` to update `docs/PROGRESS.md` and commit.
- Keep this file and PROGRESS.md short. Detail belongs in code, the spec, or git history.
