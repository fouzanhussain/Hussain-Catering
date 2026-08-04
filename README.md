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

Feature modules (Attendance, Events, Payroll, …) arrive in later phases per the
spec's build plan.

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
  context/      AuthContext (session + profile)
  hooks/        useUsers, useChannels, useMessages
  lib/          supabase client, api helpers, domain types, formatting
  locales/      en/ and es/ translation catalogs
  pages/        Login (phone OTP), Home, Chat, Team
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
