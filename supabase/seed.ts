/**
 * Phase 0 seed script.
 *
 * Creates the owner (and a couple of demo teammates) using the Supabase Admin
 * API, then writes their app profiles into public.users. Run with the SERVICE
 * ROLE key, which bypasses RLS — never ship this key to the client.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed
 *
 * Idempotent: existing users (matched by phone) are updated, not duplicated.
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before seeding.')
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

interface SeedUser {
  name: string
  phone: string // E.164
  email?: string
  role: 'owner' | 'manager' | 'employee'
  language: 'en' | 'es'
  pay_group?: 'group_1_15' | 'group_5_20'
  rounding_mode?: 'cent' | 'dollar'
}

// Edit these before running against a real project.
const SEED_USERS: SeedUser[] = [
  {
    name: 'Fouzan (Owner)',
    phone: process.env.SEED_OWNER_PHONE ?? '+15555550100',
    email: process.env.SEED_OWNER_EMAIL ?? 'owner@example.com',
    role: 'owner',
    language: 'en',
  },
  {
    name: 'Demo Manager',
    phone: '+15555550101',
    role: 'manager',
    language: 'es',
    pay_group: 'group_1_15',
    rounding_mode: 'dollar',
  },
  {
    name: 'Demo Employee',
    phone: '+15555550102',
    role: 'employee',
    language: 'es',
    pay_group: 'group_5_20',
    rounding_mode: 'cent',
  },
]

function digits(p: string): string {
  return p.replace(/\D/g, '')
}

async function findAuthUserByPhone(phone: string): Promise<string | null> {
  // Admin listUsers is paginated; small teams fit in a page or two.
  const target = digits(phone)
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const match = data.users.find((u) => u.phone && digits(u.phone) === target)
    if (match) return match.id
    if (data.users.length < 200) break
  }
  return null
}

async function ensureAuthUser(u: SeedUser): Promise<string> {
  const existing = await findAuthUserByPhone(u.phone)
  if (existing) return existing
  const { data, error } = await admin.auth.admin.createUser({
    phone: u.phone,
    email: u.email,
    phone_confirm: true,
    email_confirm: Boolean(u.email),
  })
  if (error) throw error
  return data.user.id
}

async function upsertProfile(u: SeedUser, authId: string): Promise<void> {
  const { data: existing, error: selErr } = await admin
    .from('users')
    .select('id')
    .eq('auth_id', authId)
    .maybeSingle()
  if (selErr) throw selErr

  const row = {
    auth_id: authId,
    name: u.name,
    phone: u.phone,
    email: u.email ?? null,
    role: u.role,
    language: u.language,
    pay_group: u.pay_group ?? null,
    rounding_mode: u.rounding_mode ?? 'cent',
    active: true,
  }

  if (existing) {
    const { error } = await admin.from('users').update(row).eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await admin.from('users').insert(row)
    if (error) throw error
  }
}

async function main() {
  for (const u of SEED_USERS) {
    const authId = await ensureAuthUser(u)
    await upsertProfile(u, authId)
    console.log(`✓ ${u.role.padEnd(8)} ${u.name} (${u.phone})`)
  }
  console.log('\nSeed complete.')
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
