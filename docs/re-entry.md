# Re-entry notes

## 2026-10-22: Chunk 1.1
- Built: Next.js project (TypeScript, Tailwind, App Router, src/), layout titled "Change Orders", .env.local placeholders, docs/plan.md.
- Understand well enough to explain: (fill in)
- Still fuzzy: (fill in)
- Next step: Chunk 1.2 (database tables)

## 2026-10-22: Chunk 1.2
- Built: `supabase/migrations/001_tables.sql` with the nine planned tables, business-scoped foreign keys, integer cents and thousandths, and basic constraints/indexes.
- Applied to Supabase: yes; all nine tables are present in the Table Editor.
- Understand well enough to explain: the nine tables and how their foreign keys connect them.
- Still fuzzy: pending walkthrough.
- Next step: Chunk 1.3 (security rules); `002_change_order_replaces.sql` has also been applied.

## 2026-10-22: Chunk 1.3
- Built: `supabase/migrations/003_security.sql` with row-level security policies for all nine tables.
- Applied to Supabase: yes; it completed successfully.
- Next step: Chunk 1.4 (fake test data).

## 2026-10-22: Chunk 1.4
- Built: `supabase/seed.sql` with two fake businesses, four memberships, six customers, four jobs with estimate lines, and five pricebook items per business.
- Applied to Supabase: yes; sample users were created and Valley Plumbing's jobs are visible in Supabase.
- Test accounts: `valley.owner@example.com`, `valley.tech@example.com`, `summit.owner@example.com`, `summit.tech@example.com`; set passwords in Supabase Dashboard, never in the seed file.
- Next step: Chunk 1.5 (connect Supabase and build sign-in).

## 2026-10-22: Chunk 1.5
- Built: Supabase SSR server client, Next.js 16 proxy for session refresh, sign-in/sign-out actions, a protected jobs list, and root redirect.
- Supabase connection: configured in the user's project-root `.env.local`; do not read, copy, or share its values.
- Runtime check: a Summit test account authenticated successfully and saw Summit's two sample jobs.
- Runtime isolation check: signed in as Valley, requesting a Summit job ID showed that the job was unavailable to the account.
- Validation: ESLint, TypeScript, and `next build` passed.
- Next step: Chunk 2.1 (input rules with Zod).

## 2026-10-22: Chunk 2.1
- Built: `src/lib/validation.ts` with Zod schemas for customer details, estimate lines, and a job with at least one estimate line; exported inferred TypeScript types.
- Validation rules: customer name and descriptions are required; email, phone and address may be blank; supplied emails must be valid; quantities and prices must be positive whole numbers in milli-units/cents and fit a PostgreSQL integer.
- Validation: valid and invalid schema smoke checks passed; ESLint, TypeScript, and `next build` passed.
- Next step: Chunk 2.2 (jobs list refinements).

## 2026-10-22: Chunks 2.2–2.4
- Built: responsive jobs list with estimate totals and detail links; job creation form for existing/new customers, technician assignment, multiple estimate lines and running total; job detail page with customer, status, technician, estimate and a change-order placeholder.
- Added: `src/lib/money.ts` for shared line-total rounding/currency formatting and `supabase/migrations/004_create_job.sql` for atomic job creation under the signed-in user's RLS context.
- Security: server action validates all submitted values with Zod, derives the business from the authenticated user's membership, and the SQL function checks the selected customer and technician belong to that business.
- Applied to Supabase: migration `004_create_job.sql` not yet applied.
- Validation: ESLint, TypeScript, production build, validation smoke checks, and money rounding/format smoke checks passed. Unauthenticated `/jobs/new` redirects to `/login`.
- Next step: apply `004_create_job.sql` in Supabase, create a job with a 1.5-hour labor line and confirm `quantity_milli` is `1500`, then test that a job from another business returns not found.

## 2026-10-22: Chunks 3.1–4.1
- Built: automated `money.ts` tests, shared responsive `LineItems` and `StatusBadge`, owner-editable/read-only pricebook, and change-order draft creation from pricebook items.
- Price snapshot: migration `005_create_change_order.sql` validates membership/job/item ownership, locks selected prices during the transaction, snapshots item description and unit price, and computes/stores the draft total in cents.
- Email: added server-only `src/lib/email.ts` using Resend and `npm run email:test -- your@email.com` to send a delivery test through that helper. The user configured the Resend API key and `RESEND_FROM_EMAIL="Change Orders <onboarding@resend.dev>"` locally in the project-root `.env.local`; keep the key private and never commit it. Test delivery succeeded to the Resend account email. The test email uses an `example.com` placeholder link, not a working approval link. The onboarding sender is suitable only for testing to the Resend account email; verify a domain before sending to customers.
- Apply migrations in order: `004_create_job.sql`, then `005_create_change_order.sql`. Until applied, the corresponding create-job/change-order saves will fail.
- Runtime test: signed in as `summit.owner@example.com`, updated the shutoff valve price from $29.00 to $30.00, confirmed the existing change-order draft still showed its snapshotted $29.00 line and total, then restored the pricebook item to $29.00. Signed in as `summit.tech@example.com`; the pricebook correctly showed only the view-only page.
- Fixed during runtime testing: server-action validators now live directly in the server action modules (Turbopack was resolving imported validators as undefined at runtime); request-time pages call `connection()` to avoid dev prerender warnings; jobs query now selects `business_id`, fixing list totals that were displaying $0.00.
- Validation: `npm test` (7 passing), full ESLint, TypeScript, production build, and `git diff --check` pass. An invalid-recipient email-test run was rejected before sending; authenticated test email delivered successfully; unauthenticated `/pricebook` redirects to sign-in. Authenticated Supabase writes work after migrations 004 and 005 were applied.
- Resend setup: create/verify a sender domain in Resend, add the DNS records Resend displays at the domain's DNS host, create an API key, and place the server-only values in `.env.local`. For initial testing, Resend's onboarding sender can only deliver to the account's verified recipient; a verified domain is needed for ordinary recipients.
- Next: run automated checks, apply migrations 004 and 005, verify owner vs. tech pricebook permissions, create a draft and confirm its copied line price survives a later pricebook edit, then configure Resend and test with `npm run email:test -- your@email.com`.

## 2026-10-22: Chunks 4.2–5.2
- Built: authenticated send-for-approval flow, opaque random token with SHA-256 hash storage, public customer approval page, one-time approve/decline API, approved-only invoice, and print-to-PDF styles/button.
- Security: migration `006_approval_workflow.sql` adds narrowly scoped `SECURITY DEFINER` RPCs with fixed empty search paths. Send/rollback require an authenticated business member. Public read returns only customer-facing details for a valid token hash. Decision locks the approval and change order, verifies expiry/version/status, and updates the approval and change order in one database transaction.
- Email behavior: if Resend fails, the request removes the unused approval and returns the change order to draft; if that rollback fails, the route throws an explicit error for manual review.
- Migration `006_approval_workflow.sql` must be applied in Supabase before sending or opening public approval links. `RESEND_FROM_EMAIL` currently uses `onboarding@resend.dev`, which can only deliver to the Resend account email; verify a sending domain before sending to a customer's email.
- Validation: 12 tests pass, full ESLint, TypeScript, production build, and `git diff --check` pass. Database-backed expired/replay/version tests and end-to-end email-to-decision tests still require applying migration 006 and a verified sender domain.
- Next: apply migration 006; test an invalid token and valid approval, approve and decline in test records, verify repeat/expired/outdated decisions fail, confirm only approved changes appear in the invoice, then use Print / Save as PDF.

## 2026-10-22: Fixing job creation and numeric inputs
- Fixed job creation: the server action now maps estimate-line fields to the snake_case JSON keys that `create_job_with_estimate` expects.
- Quantity inputs on estimate and change-order forms accept positive whole numbers only; the underlying database quantity remains thousandths (`1` is stored as `1000`). Server actions enforce the same rule.
- Price inputs use decimal-friendly text fields with validation for up to two decimal places.
- Validation: 13 tests pass, ESLint, TypeScript, production build, and `git diff --check` pass. The new job flow still needs to be clicked through while authenticated against the user's Supabase project.
- Next: reload the app, create a job with an estimate line quantity of `1`, verify it saves and redirects to the job, and confirm decimal quantities are rejected.

## 2026-10-22: Phone experience
- Built: bottom menu bar for phones (`src/components/MobileNav.tsx`: Jobs, New job, Pricebook, Sign out) that highlights the current tab, clears the iPhone home strip, and hides on desktop, the sign-in page, customer approval links, and printouts. Top header buttons on the jobs list are desktop-only now since the bar replaces them.
- Added tap-to-call, tap-to-text, tap-for-directions (maps) and tap-to-email links on the job's customer card, via `src/lib/contact.ts` (tested in `tests/contact.test.ts`). Page viewport set so phones use the full screen and tint the browser bar.
- Validation: 17 tests pass, ESLint, TypeScript and production build pass. Checked in a 390px-wide browser: bar pinned to the bottom, tab navigation works, bar hidden at 1280px.
- Not yet tried on a real phone. Next: open the app on a phone (same Wi-Fi, use the computer's network address with port 3000) and tap through jobs, New job, Pricebook and Call/Text.

## Customers and Team pages (latest)

- App is now named Tinkr. Customers (`/customers`, add, edit, delete, search) and Team (`/team`) pages are built. Customer email, phone and address are required; phone must be `(xxx) xxx-xxxx`.
- Team invites: an owner enters an email; the server (using `SUPABASE_SERVICE_ROLE_KEY`, server-only in `src/lib/supabase/admin.ts`) creates the login, adds the member, and emails a one-time link through Resend. The link hits `/auth/confirm`, then `/welcome` to set a password. If the email fails, the login and member row are rolled back. The handshake (generateLink, verifyOtp, updateUser) was tested against the real project with a throwaway user.
- Migration `008_team_management.sql` (`set_member_role`, `remove_team_member`) must be applied in Supabase before changing roles or removing people. Migrations 006 and 007 are still pending as well.
- Real invite emails need a verified Resend sender domain (same limit as approval emails).
- Remaining build order the user chose: Invoices list, Sign up and onboarding, Schedule, Dashboard, Settings.

## Invoices list

- `/invoices`: totals (Outstanding, Overdue, Paid), filter chips, and a row per job with a billable total (estimate + approved changes). Owners get "Mark paid" / "Undo".
- Migration `009_invoice_payments.sql` adds `jobs.paid_at`; must be applied or the page errors. Overdue = unpaid and job older than 30 days (`src/lib/invoices.ts`).
- Mobile nav now has 7 slots (6 tabs + sign out) at 10px labels; check on a real phone.

## Decline reasons and field encryption

- Declines carry a reason (drop-down) plus a note of up to 300 characters (required for "Other"); migration `010_decline_reasons.sql` must be applied. Security headers are set in `next.config.ts`.
- Customer email, phone and address are encrypted with AES-256-GCM in the server (`src/lib/field-crypto.ts`) before saving, and decrypted after loading. Needs `FIELD_ENCRYPTION_KEY` in `.env.local` (generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`). Back this key up and set it in Vercel too; losing it makes the data unreadable.
- Existing plain-text rows keep working and can be encrypted with `npm run encrypt:existing`.

## 2026-10-26: Security review fixes
- Built: migration `011_lock_owner_rules.sql`. The database itself now enforces owner-only rules instead of only hiding buttons: only owners mark invoices paid (new `set_job_paid` function; techs can't touch `paid_at`), only owners delete customers and jobs, change-order lines can only be created from the pricebook (no hand-typed prices or totals), and estimates lock once the invoice is paid (and, after a change order is sent, only an owner can edit them).
- App changes: Mark paid now calls `set_job_paid`. Approval and invite email links use a fixed `APP_URL` (`src/lib/app-url.ts`); in development it falls back to the address you're browsing from.
- Tested: 011 was applied after 001–010 to a local Postgres copy with a Supabase-like login stub; tech/owner/other-company checks behaved as expected; the file is safe to run twice. TypeScript and ESLint pass.
- To do: apply 006–011 in Supabase in order; set `APP_URL` in Vercel; make the GitHub repo private; commit; in Supabase turn off public sign-ups, turn on leaked-password protection and backups; back up `FIELD_ENCRYPTION_KEY` in a password manager; run `npm run encrypt:existing`.
