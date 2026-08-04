# Catering Ops CRM — Product Specification & Architecture

**Version 1.1 — Planning document for implementation with Claude Code**
*(v1.1 incorporates owner decisions: PWA-first, mixed pay bases, semi-monthly pay groups, cash advances, manager-only attendance, EN/ES, per-employee rounding.)*

---

## 1. Product Overview

An internal operations platform for a catering business, replacing WhatsApp as the hub for team communication, attendance, payroll, event scheduling, vendor payments, cash handling, and inventory requests.

**Users:** Owner (you), managers, and employees. Small team (assume 5–50 users). Internal only — no customer-facing features in v1.

**Platforms:** **PWA-first.** One responsive web app, installable to the home screen on employee phones (manifest + service worker + web push). A native Expo app is deferred to v2 only if iOS push notifications prove unreliable.

**Languages:** Full **English and Spanish** UI. Every user picks their language in their profile; all screens, notifications, and system messages are localized. (Chat message content is whatever users type — no translation in v1.)

**Core principle:** Structured workflows over free-form chat. WhatsApp made everything a chat; this system makes attendance, payroll, cash logs, and inventory *structured records* with optional discussion attached, and reserves real chat for actual discussion.

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Backend / DB | **Supabase** (Postgres + Auth + Realtime + Storage + RLS) | Auth, realtime chat, file storage, and row-level security in one service. RLS enforces chat/role/salary permissions at the database layer. No server to maintain. |
| App | **React + Vite + TypeScript + Tailwind, built as a PWA** | Single codebase for desktop admin and mobile employee use. `vite-plugin-pwa` for install/offline shell; Web Push for notifications. |
| i18n | **react-i18next** with `en` and `es` JSON catalogs | Standard, works with lazy loading. All strings via translation keys from day one — retrofitting i18n is painful. |
| Server logic | **Supabase Edge Functions** | Payroll computation, period locking, notification fan-out run server-side with service role. Never on the client. |
| Repo | Single app repo: `src/`, `supabase/` (migrations + functions), `locales/` | Monorepo not needed without a native app. |

---

## 3. Roles & Permissions Model

### 3.1 Roles

| Role | Description |
|---|---|
| `owner` | You. Full access. Only role that can view/edit salaries and rates, approve/lock payroll, manage roles, and delete data. |
| `manager` | Marks attendance (including check-in/out times), manages events, logs cash pickups, **records cash advances**, approves inventory, accesses management channels. **Cannot see any salary, rate, or payroll amount.** |
| `employee` | Sees own attendance, own payslips, own advances, assigned channels, assigned events; submits inventory requests. |

Fine-grained permission flags on the user record allow per-person exceptions:

```
permissions: {
  view_payroll: bool,        -- owner-only by default; grantable
  manage_attendance: bool,
  manage_events: bool,
  manage_vendors: bool,
  log_cash: bool,
  log_advances: bool,        -- record cash advances (managers by default)
  approve_inventory: bool,
  create_channels: bool
}
```

Role sets the defaults; flags override per person. Code checks flags, not roles.

### 3.2 The salary blindness rule (critical)

Managers interact with money in two places — cash envelopes and cash advances — **without ever seeing what anyone earns.** Enforced in the schema, not the UI:

- `salary_rates`, `payroll_entries`, `payroll_adjustments`: RLS denies `SELECT` to anyone except owner / `view_payroll` holders, and each employee for their own rows.
- `cash_advances`: managers with `log_advances` can `INSERT` and `SELECT` advances (they need to see what's already been advanced to avoid double-advancing), but this table contains only advance amounts — never salary. An advance amount alone reveals nothing about pay rate.
- The manager UI has no payroll section at all; but even a tampered client hits the RLS wall.

### 3.3 Chat access control

- Every channel has a `channel_members` table. Owner (or anyone with `create_channels`) creates channels and adds/removes members.
- **Enforced by Postgres RLS:** a user can only read messages in channels where their membership row exists.
- Removing a member **revokes everything immediately, including all history** (owner decision). The channel simply disappears from their app.

---

## 4. Feature Specifications

### 4.1 Team & Roles Management (Owner)

- Invite by phone number → Supabase phone OTP signup link.
- Owner sets: name, role, permission flags, preferred language, **pay basis, rate, pay group, rounding mode** (owner-only fields), hire date, active status.
- Deactivation: revokes login, removes from all channels, retains all historical records.

### 4.2 Attendance (manager-only marking)

**No employee self check-in.** Managers and the owner mark everything (owner decision #5).

**Flow:**
1. Manager opens the **daily roster** — every active employee listed with quick actions.
2. For each employee, manager marks status: `present`, `absent`, `half_day`, `excused_paid`, `excused_unpaid`.
3. **For hourly employees, marking `present` requires check-in and check-out times** (time pickers, editable later). Hours worked are computed from these; overnight shifts supported (checkout past midnight rolls to next day). Optional break-minutes field deducted from hours.
4. Attendance rows can link to a specific event.
5. Every edit stores who edited, when, and an optional reason (audit trail). Corrections allowed until the covering pay period is locked; after lock, attendance for that range is frozen.

**Views:**
- Employee: own attendance calendar, hours/days so far this period (no pay amounts shown unless viewing own payslip).
- Manager/owner: daily roster, per-employee history, per-period summary, CSV export.

### 4.3 Events Calendar

- Month/week/agenda views.
- Event fields: title, client name, client phone, venue address, date, start/end time, headcount, notes, status (`inquiry`, `confirmed`, `completed`, `cancelled`), assigned staff.
- Assigning staff optionally auto-creates an **event channel** (archived after the event).
- Employees see only their assigned events; managers/owner see all.
- v2: menu/prep checklist and client invoice per event.

### 4.4 Vendor Payment Planner

- **Vendors:** name, phone, category, notes.
- **Scheduled payments:** vendor, amount, due date, method (`cash`, `zelle`, `check`, `card`, `other`), status (`scheduled`, `paid`, `overdue`, `cancelled`), optional event link, receipt photo, notes.
- Views: upcoming (30 days), calendar overlay toggle, per-vendor history and totals.
- Marking paid records actor + timestamp; overdue items pinned to owner dashboard; reminder notification N days before due (default 2).

### 4.5 Payroll

This is the most business-specific part of the system. Read carefully.

#### 4.5.1 Pay bases (per employee)

| Basis | Config | Gross formula per period |
|---|---|---|
| `per_day` | day rate | `rate × (present + excused_paid + 0.5 × half_day)` |
| `hourly` | hourly rate | `rate × total_hours` (from manager-entered in/out times; half_day just means fewer hours — no multiplier) |
| `semi_monthly_salary` | salary per period | `salary − daily_value × (absent + excused_unpaid) − 0.5 × daily_value × half_day`, where `daily_value = salary ÷ 13` |

**Expected workdays = 13 per period** (owner decision #4: 13 of ~15 calendar days). Configurable constant; per-employee override possible in v2.

#### 4.5.2 Earning periods and pay groups

**Each pay group has its own earning calendar.** Both groups are paid at period close for the days worked in that period (owner-confirmed):

| Group | Earning period | Paid on |
|---|---|---|
| `group_1_15` | 1st – 15th | the 15th |
| `group_1_15` | 16th – end of month | the 1st (next month) |
| `group_5_20` | 5th – 20th | the 20th |
| `group_5_20` | 21st – 4th (next month) | the 5th |

- The system generates **two parallel period tracks**, one per group. Every calendar day belongs to exactly one period within each track; attendance is recorded by date and each employee's payroll pulls from the period track of their group.
- Payday includes that day's own work (paid on the 20th for the 5th–20th inclusive), so mark that day's attendance before running the payout. Practical workflow: move the period to `review` the evening before, mark payday-morning attendance, lock, pay.
- **13 expected workdays** applies to salaried staff in both tracks, even though calendar lengths vary slightly (15–17 days).
- The payroll screen shows both tracks side by side with their next payout dates; the dashboard reminds you on the 1st, 5th, 15th, and 20th.
- Changing an employee's pay group takes effect at their next *unstarted* period — never mid-period (prevents double-paid or unpaid days).

#### 4.5.3 Cash advances

- Anyone with `log_advances` (managers by default) records: employee, amount, date, method (`cash`, `zelle`, other), note. The employee receives a notification and can view their own advances.
- Optional v1.5: employee taps **Acknowledge** on the advance — a two-party record that prevents "I never took that" disputes.
- Open advances **auto-attach as deductions** to the employee's next `review`-stage payroll entry. Owner can split an advance across two periods if it's large (edit the deduction, remainder rolls forward).
- Managers can see the advances ledger (amounts they and others advanced) but never any payroll numbers.
- If total advances exceed the period's net, the remainder rolls to the next period automatically and the payslip shows a carryover balance.

#### 4.5.4 Rounding (per employee)

- Employee-level toggle: `rounding_mode = 'cent' | 'dollar'` (owner decision #8).
- `cent`: round half-up to $0.01. `dollar`: round half-up to $1 — **applied once, to the final net**, not to intermediate values (intermediate math keeps full precision to avoid drift).

#### 4.5.5 Period lifecycle

`open` (accruing) → `review` (owner sees computed sheet: days/hours breakdown, gross, advances, adjustments, net per employee) → `locked` (frozen forever; attendance in range also freezes) → `paid` (per-employee paid date + method).

- Manual adjustment line items in review: bonus, tip share, correction, etc. (amount + reason).
- Rate/salary changes are append-only with effective dates; the computation uses the rate effective during the period. Locked periods never change.
- Employee payslip: days/hours breakdown, gross, advances deducted, adjustments, net, rounding applied, running advance carryover. Localized EN/ES.

### 4.6 Cash Envelope Log

Structured ledger with a comment thread per entry (not a chat).

- Entry: date/time, amount, source event/client, picked up by, handed to (optional), status (`picked_up`, `delivered_to_owner`, `deposited`), photo, notes.
- Custody chain: employee/manager with `log_cash` files pickup → owner confirms receipt → status advances. Two-tap accountability.
- Views: filter by date/employee/event; running total of cash in transit. Every status change timestamped with actor.

### 4.7 Inventory Requests

Request queue with comment threads (not a chat).

- Fields: item, quantity, unit, urgency (`normal`, `urgent`), needed-by date, optional event link, optional photo.
- Statuses: `requested` → `approved`/`rejected` → `purchased` → `received`. Approver = `approve_inventory` holders.
- Kanban board by status + list view; filters by urgency, event, requester. Comments per request.
- v2: recurring items / par levels.

### 4.8 Chat

- **Channel types:** `management` (auto: owner + managers), `general` (auto: everyone), `custom` (created by owner / `create_channels` holders), `event` (auto per event, auto-archived), `dm` (1:1).
- v1: text, image attachments, realtime delivery, unread counts, @mentions, delete-own-message (owner can delete any).
- Membership changes post localized system messages ("Fouzan añadió a Ali").
- Removal = instant full revocation including history.
- v2: voice notes, reactions, pins, search.

### 4.9 Owner Dashboard

- Today: roster status (marked/unmarked), today's events.
- This week: events, vendor payments due/overdue.
- Payroll: current period status per pay group, next payout dates, unacknowledged advances.
- Cash in transit; pending inventory count.

---

## 5. Data Model (Postgres)

```
users               id, auth_id, name, phone, email, role, permissions jsonb,
                    language (en|es), active, hire_date, avatar_url,
                    pay_group (group_1_15|group_5_20),
                    rounding_mode (cent|dollar), created_at

salary_rates        id, user_id, basis (per_day|hourly|semi_monthly_salary),
                    amount numeric, effective_date, created_by, created_at
                    -- append-only history

pay_periods         id, pay_group (group_1_15|group_5_20),
                    start_date, end_date,   -- 1–15/16–EOM or 5–20/21–4
                    payout_date,
                    status (open|review|locked|paid),
                    locked_at, locked_by
                    -- two parallel tracks; unique (pay_group, start_date)

payroll_entries     id, pay_period_id, user_id, basis_snapshot, rate_snapshot,
                    present_days, half_days, absent_days,
                    excused_paid, excused_unpaid, total_hours numeric,
                    gross numeric, advances_deducted numeric,
                    adjustments_total numeric, net numeric,
                    rounding_mode_snapshot, computed_at, paid_at, paid_method

payroll_adjustments id, payroll_entry_id, amount, reason, created_by, created_at

cash_advances       id, user_id, amount numeric, date, method, note,
                    recorded_by, acknowledged_at nullable,
                    remaining_balance numeric,      -- rolls across periods
                    created_at

advance_deductions  id, cash_advance_id, payroll_entry_id, amount, created_at

attendance          id, user_id, date, status,
                    check_in_at, check_out_at, break_minutes,  -- hourly staff
                    hours_worked numeric generated,
                    event_id nullable, marked_by, edited_by, edit_reason,
                    locked bool, created_at

events              id, title, client_name, client_phone, venue, date,
                    start_time, end_time, headcount, status, notes, created_by
event_staff         event_id, user_id

vendors             id, name, phone, category, notes, active
vendor_payments     id, vendor_id, amount, due_date, method, status,
                    event_id nullable, paid_at, paid_by, receipt_url, notes

cash_entries        id, amount, event_id nullable, picked_up_by, handed_to,
                    status, photo_url, notes, created_at
cash_entry_log      id, cash_entry_id, from_status, to_status, acted_by, at

inventory_requests  id, item, qty, unit, urgency, needed_by, event_id nullable,
                    status, requested_by, decided_by, photo_url, created_at

channels            id, name, type, event_id nullable, created_by, archived, created_at
channel_members     channel_id, user_id, added_by, added_at
messages            id, channel_id, sender_id, body, attachment_url, deleted, created_at

comments            id, entity_type (cash|inventory|vendor_payment|advance),
                    entity_id, sender_id, body, created_at

notifications       id, user_id, type, payload jsonb, read, created_at
push_subscriptions  id, user_id, endpoint, keys jsonb, created_at   -- web push
```

**RLS policy sketch (security core):**
- `messages`: read/write only with matching `channel_members` row.
- `salary_rates`, `payroll_entries`, `payroll_adjustments`: `SELECT` only for owner / `view_payroll`, plus each user's own rows. `INSERT/UPDATE` owner + Edge Functions only.
- `cash_advances`: `INSERT` for `log_advances` holders; `SELECT` for `log_advances` holders, owner, and the employee (own rows). No salary data lives here.
- `attendance`: `INSERT/UPDATE` for `manage_attendance` holders only (no employee self-insert); employees `SELECT` own rows; `UPDATE` blocked where `locked = true` (trigger).
- Payroll computation, period lifecycle transitions, and advance auto-deduction run in **Edge Functions** with service role.

---

## 6. Build Phases (for Claude Code)

Each phase is shippable and testable on its own. Set up i18n scaffolding in Phase 0 — every string is a translation key from the first screen.

**Phase 0 — Foundation:** Vite PWA scaffold (manifest, service worker, install prompt), react-i18next with en/es catalogs + language switcher, Supabase project, `users` schema + phone OTP auth, roles/flags, deny-all RLS baseline, seed script.

**Phase 1 — Team + Chat:** User management, invite flow, channels/members/messages with RLS, realtime, auto general + management channels, create channel + add/remove members, image upload, unread counts.
*→ Team leaves WhatsApp here.*

**Phase 2 — Attendance:** Daily roster for managers, status marking, time entry + break minutes for hourly staff, hours computation, audit trail, employee self-view, CSV export.

**Phase 3 — Events:** Event CRUD, calendar views, staff assignment, auto event channels.

**Phase 4 — Payroll:** Salary rates UI (owner), semi-monthly period generation with dual payout dates, Edge Function computation for all three bases, advances ledger + auto-deduction + carryover, adjustments, rounding modes, review/lock/paid lifecycle, localized payslips, CSV export.
*Test rigorously: seed one fake period per basis × rounding mode × an advance-exceeds-net case, and assert exact expected numbers before trusting it with real pay.*

**Phase 5 — Vendor Payments:** Vendors CRUD, schedule, overdue/upcoming views, receipts, calendar overlay, reminders.

**Phase 6 — Cash Log + Inventory:** Custody-chain ledger + comments; request queue + board + comments.

**Phase 7 — Dashboard + Web Push + Polish:** Owner dashboard, web push subscriptions + notification fan-out Edge Function, badges, empty states, error handling, Spanish translation pass with a native speaker review.

**Phase 8 (v2, only if needed) — Native app:** Expo wrapper if iOS web push disappoints.

---

## 7. Resolved Decisions (owner-confirmed)

1. **PWA-first**; native app deferred.
2. **Mixed pay bases:** per-day, hourly, and semi-monthly salary — all three supported. Managers record **cash advances** but can never see salaries or payroll amounts.
3. **Two pay-group tracks, each earning over its own dates, paid at period close:** group_1_15 earns 1–15 (paid 15th) and 16–EOM (paid 1st); group_5_20 earns 5–20 (paid 20th) and 21–4 (paid 5th).
4. **13 expected workdays** per period for salaried staff.
5. **Manager-only attendance marking** (with in/out times for hourly employees).
6. **Full history revocation** on chat removal.
7. **English + Spanish** UI.
8. **Per-employee rounding toggle:** nearest cent or nearest dollar, applied once to final net.

All decisions are resolved. The spec is build-ready.

## 8. Non-Functional Requirements

- Money as `numeric`, never floats; intermediate payroll math at full precision, rounding applied once at final net.
- Timestamps UTC, displayed in `America/Chicago`.
- Soft-delete everywhere; never hard-delete financial or attendance records. Every money-adjacent mutation records `acted_by` + timestamp.
- Daily automated Supabase backups from day one; test a restore once before running real payroll.
- Rate-limit auth; owner account gets the strongest available auth factors.
- Works on a 3-year-old Android phone on venue Wi-Fi: small bundles, paginated history, offline shell for read-only views.
