# Hussain Catering — Ops CRM

Internal operations platform for a catering business: attendance, payroll,
events, vendor payments, cash handling, inventory, and team chat. **PWA-first**,
fully bilingual (**English / Spanish**), built on Supabase.

See [`docs/spec.md`](docs/spec.md) for the full product specification.

## Status

### Phase 0 (Foundation) ✅

- **Vite + React + TypeScript + Tailwind**, built as an installable **PWA**
  (manifest, service worker, custom install prompt, update prompt, offline shell).
- **i18n from the first screen** — `react-i18next` with `en` / `es` catalogs and
  a language switcher. Every string is a translation key; the choice persists to
  the user's profile once signed in.
- **Supabase auth** via **phone OTP** sign-in.
- **`users` schema** with roles (`owner` / `manager` / `employee`) and
  fine-grained permission flags (code checks flags, not roles).
- **Deny-all RLS baseline** — RLS enabled and forced; no access without an
  explicit policy.

### Phase 1 (Team + Chat) ✅

*Team leaves WhatsApp here.*

- **Team management (owner):** invite by phone, set role / permission flags /
  language / pay group / rounding / hire date, edit, and deactivate.
- **Channels & membership** enforced by RLS — you can read a channel's messages
  only while your `channel_members` row exists; removal revokes history instantly.
- **Auto channels:** a singleton **general** (everyone) and **management**
  (owner + managers) channel, membership kept in sync as people are hired,
  change role, or are deactivated.
- **Realtime messaging** with image attachments (private, membership-gated
  storage), **unread counts**, delete-own-message (owner can delete any), and
  **localized system messages** on membership changes.
- **Create custom channels** and add/remove members (owner or `create_channels`).

### Phase 2 (Attendance) ✅

*Manager-only marking — no employee self check-in (spec §4.2).*

- **Daily roster** for managers/owner: every active employee with quick status
  actions (`present` / `absent` / `half_day` / `excused_paid` / `excused_unpaid`).
- **Hourly staff:** marking *present* requires check-in/out times; **hours are
  computed** (overnight shifts roll checkout to the next day, break minutes
  deducted) via a generated column. Basis comes from a new non-sensitive
  `pay_basis` field on `users` (managers can see basis, never pay amounts).
- **Audit trail:** every insert/edit stamps the acting user + timestamp
  server-side; an optional edit reason is recorded. Rows **freeze when locked**
  (enforced by trigger; pay-period locking lands in Phase 4).
- **Employee self-view:** own attendance history and month day/hour totals — no
  pay amounts.
- **Per-employee history** and **CSV export** (roster day or employee month).
- Route-based **code splitting** so each screen loads on demand.

### Phase 3 (Events) ✅

- **Events calendar** with **agenda / week / month** views and prev/next/today
  navigation.
- **Event CRUD** (managers/owner): title, client name/phone, venue, date,
  start/end time, headcount, status (`inquiry` / `confirmed` / `completed` /
  `cancelled`), notes, and **staff assignment**.
- **Auto event channel** (optional): assigning staff can spin up an `event`-type
  chat channel with the assigned staff; it **archives automatically** when the
  event is completed or cancelled.
- **Employees see only their assigned events** (enforced by RLS via an
  `is_event_staff` helper) and get a read-only detail view.

Feature modules (Payroll, Vendor Payments, Cash/Inventory, Dashboard) arrive in
later phases per the spec's build plan.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

### Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the Vite dev server. |
| `npm run build` | Type-check and build the production PWA. |
| `npm run preview` | Preview the production build (service worker active). |
| `npm run typecheck` | Type-check only. |
| `npm run icons` | Regenerate PWA icons in `public/`. |
| `npm run seed` | Seed users via the Supabase Admin API (needs service-role key). |

## Database & Supabase

Migrations live in `supabase/migrations` and are applied in order:

1. `0001_init_users.sql` — enums, `users` table, permission defaults, and the
   `SECURITY DEFINER` helpers (`is_owner`, `app_has_permission`,
   `current_app_user_id`) plus the auth-linking trigger.
2. `0002_rls_baseline.sql` — enable/force RLS and the minimal `users` policies.
3. `0003_chat.sql` — channels, members, messages, read markers, the
   `is_channel_member` helper, unread-count RPC, auto-channel sync, and system
   messages; adds `messages`/`channel_members` to the realtime publication.
4. `0004_chat_rls.sql` — membership-based RLS for chat, expanded team
   visibility, and the private `chat-attachments` storage bucket + policies.
5. `0005_attendance.sql` — `pay_basis` on `users`, the `attendance` table with
   a generated `hours_worked` column, and the audit / locked-row triggers.
6. `0006_attendance_rls.sql` — manager-only INSERT/UPDATE, employee self-read.
7. `0007_events.sql` — `events` + `event_staff`, the `is_event_staff` helper,
   and FKs wiring `channels.event_id` / `attendance.event_id` to events.
8. `0008_events_rls.sql` — `manage_events` full access; employees read only
   their assigned events.

Apply them with the Supabase CLI (`supabase db push` against a linked project or
`supabase start` locally), or paste them into the SQL editor in order.

### Seeding

- **`supabase/seed.ts`** (`npm run seed`) creates the owner + demo users through
  the Admin API and writes their profiles. Requires `SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY` in the environment. Edit `SEED_USERS` first.
- **`supabase/seed.sql`** inserts demo profiles with `auth_id = NULL`; they link
  automatically when a matching phone number first completes OTP signup.

### Auth linking

The owner invites teammates by phone number and pre-fills their profile. When
that person completes phone OTP signup, the `on_auth_user_created` trigger
matches their number (digits-only) to the unlinked profile and sets `auth_id`.

## Project layout

```
src/
  components/   AppShell, LanguageSwitcher, InstallPrompt, UpdatePrompt
    chat/       MessageThread, ManageMembersModal
    attendance/ RosterRow, EmployeeAttendance
    events/     EventForm, EventDetail
  context/      AuthContext (session + profile)
  hooks/        useUsers, useChannels, useMessages, useAttendance, useEvents
  lib/          supabase client, api helpers, types, formatting, attendance, calendar
  locales/      en/ and es/ translation catalogs
  pages/        Login (phone OTP), Home, Chat, Attendance, Events, Team
  i18n.ts       react-i18next setup
supabase/
  migrations/   SQL schema + RLS
  functions/    Edge Functions (later phases)
  config.toml   local dev config (phone auth)
  seed.ts       Admin-API seed
  seed.sql      no-auth SQL seed
scripts/
  gen-icons.mjs PWA icon generator (no external deps)
```

## Notes

- Money is `numeric`, timestamps are UTC (displayed `America/Chicago`), and
  financial/attendance records are soft-deleted — enforced as those tables land.
- The anon key is safe in the client bundle; the **service-role key must never**
  reach the browser (seed script only).
