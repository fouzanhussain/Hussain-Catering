-- ============================================================================
-- Phase 0 SQL seed (no-auth variant).
-- ============================================================================
-- Inserts demo profiles with fixed IDs so it is safe to re-run. These rows have
-- auth_id = NULL; they link automatically the first time a matching phone
-- number completes OTP signup (see handle_new_auth_user in migration 0001).
--
-- Prefer supabase/seed.ts when you want the auth users created for you.
-- Run this via the Supabase SQL editor or `supabase db execute`.

insert into public.users (id, name, phone, email, role, language, pay_group, rounding_mode, active)
values
  ('00000000-0000-0000-0000-000000000001', 'Fouzan (Owner)', '+15555550100', 'owner@example.com',
   'owner', 'en', null, 'cent', true),
  ('00000000-0000-0000-0000-000000000002', 'Demo Manager', '+15555550101', null,
   'manager', 'es', 'group_1_15', 'dollar', true),
  ('00000000-0000-0000-0000-000000000003', 'Demo Employee', '+15555550102', null,
   'employee', 'es', 'group_5_20', 'cent', true)
on conflict (id) do update set
  name = excluded.name,
  phone = excluded.phone,
  email = excluded.email,
  role = excluded.role,
  language = excluded.language,
  pay_group = excluded.pay_group,
  rounding_mode = excluded.rounding_mode,
  active = excluded.active;
