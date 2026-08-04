// Shared domain types for the Catering Ops CRM.
// These mirror the Postgres schema (see supabase/migrations).

export type Role = 'owner' | 'manager' | 'employee'

export type PayGroup = 'group_1_15' | 'group_5_20'

export type RoundingMode = 'cent' | 'dollar'

/**
 * Fine-grained permission flags stored on the user record.
 * Roles set the defaults; flags override per person. Code checks flags, not roles.
 */
export interface Permissions {
  view_payroll: boolean // owner-only by default; grantable
  manage_attendance: boolean
  manage_events: boolean
  manage_vendors: boolean
  log_cash: boolean
  log_advances: boolean // record cash advances (managers by default)
  approve_inventory: boolean
  create_channels: boolean
}

export const PERMISSION_KEYS: (keyof Permissions)[] = [
  'view_payroll',
  'manage_attendance',
  'manage_events',
  'manage_vendors',
  'log_cash',
  'log_advances',
  'approve_inventory',
  'create_channels',
]

/** Default permission flags per role. Mirrors the DB `default_permissions()` function. */
export function defaultPermissions(role: Role): Permissions {
  const none: Permissions = {
    view_payroll: false,
    manage_attendance: false,
    manage_events: false,
    manage_vendors: false,
    log_cash: false,
    log_advances: false,
    approve_inventory: false,
    create_channels: false,
  }
  switch (role) {
    case 'owner':
      return {
        view_payroll: true,
        manage_attendance: true,
        manage_events: true,
        manage_vendors: true,
        log_cash: true,
        log_advances: true,
        approve_inventory: true,
        create_channels: true,
      }
    case 'manager':
      return {
        ...none,
        manage_attendance: true,
        manage_events: true,
        manage_vendors: true,
        log_cash: true,
        log_advances: true,
        approve_inventory: true,
        create_channels: true,
      }
    case 'employee':
    default:
      return none
  }
}

/** A row of the `users` table (the app profile, keyed to a Supabase auth user). */
export interface UserProfile {
  id: string
  auth_id: string | null
  name: string
  phone: string | null
  email: string | null
  role: Role
  permissions: Permissions
  language: string
  active: boolean
  hire_date: string | null
  avatar_url: string | null
  pay_group: PayGroup | null
  rounding_mode: RoundingMode
  created_at: string
}

export function hasPermission(
  profile: Pick<UserProfile, 'permissions'> | null,
  key: keyof Permissions,
): boolean {
  return Boolean(profile?.permissions?.[key])
}

// --- Chat (Phase 1) -------------------------------------------------------

export type ChannelType = 'management' | 'general' | 'custom' | 'event' | 'dm'

export type MessageKind = 'user' | 'system'

export interface Channel {
  id: string
  name: string
  type: ChannelType
  event_id: string | null
  created_by: string | null
  archived: boolean
  created_at: string
}

/** A channel plus client-side view state (unread count). */
export interface ChannelWithMeta extends Channel {
  unread: number
}

export interface ChannelMember {
  channel_id: string
  user_id: string
  added_by: string | null
  added_at: string
}

/** Structured payload for localized system messages (member added/removed). */
export interface SystemEvent {
  type: 'member_added' | 'member_removed'
  actor: string | null
  target: string | null
}

export interface Message {
  id: string
  channel_id: string
  sender_id: string | null
  kind: MessageKind
  body: string | null
  attachment_url: string | null
  system_event: SystemEvent | null
  deleted: boolean
  created_at: string
}

/** Channel types that are auto-managed and cannot be renamed/deleted by hand. */
export function isAutoChannel(type: ChannelType): boolean {
  return type === 'general' || type === 'management'
}
