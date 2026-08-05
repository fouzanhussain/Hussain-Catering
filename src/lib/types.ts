// Shared domain types for the Catering Ops CRM.
// These mirror the Postgres schema (see supabase/migrations).

export type Role = 'owner' | 'manager' | 'employee'

export type PayGroup = 'group_1_15' | 'group_5_20'

export type RoundingMode = 'cent' | 'dollar'

export type SalaryBasis = 'per_day' | 'hourly' | 'semi_monthly_salary'

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
  pay_basis: SalaryBasis | null
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

// --- Attendance (Phase 2) -------------------------------------------------

export type AttendanceStatus =
  | 'present'
  | 'absent'
  | 'half_day'
  | 'excused_paid'
  | 'excused_unpaid'

export const ATTENDANCE_STATUSES: AttendanceStatus[] = [
  'present',
  'absent',
  'half_day',
  'excused_paid',
  'excused_unpaid',
]

export interface Attendance {
  id: string
  user_id: string
  date: string // YYYY-MM-DD
  status: AttendanceStatus
  check_in_at: string | null
  check_out_at: string | null
  break_minutes: number
  hours_worked: number | null
  event_id: string | null
  marked_by: string | null
  edited_by: string | null
  edit_reason: string | null
  locked: boolean
  created_at: string
  updated_at: string
}

// --- Events (Phase 3) -----------------------------------------------------

export type EventStatus = 'inquiry' | 'confirmed' | 'completed' | 'cancelled'

export const EVENT_STATUSES: EventStatus[] = [
  'inquiry',
  'confirmed',
  'completed',
  'cancelled',
]

export interface CateringEvent {
  id: string
  title: string
  client_name: string | null
  client_phone: string | null
  venue: string | null
  date: string // YYYY-MM-DD
  start_time: string | null // HH:MM[:SS]
  end_time: string | null
  headcount: number | null
  status: EventStatus
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** An event that has run or been called off no longer needs its chat channel. */
export function isEventClosed(status: EventStatus): boolean {
  return status === 'completed' || status === 'cancelled'
}

// --- Payroll (Phase 4) ----------------------------------------------------

export type AdvanceMethod = 'cash' | 'zelle' | 'other'

export type PayPeriodStatus = 'open' | 'review' | 'locked' | 'paid'

export interface SalaryRate {
  id: string
  user_id: string
  basis: SalaryBasis
  amount: number
  effective_date: string
  created_by: string | null
  created_at: string
}

export interface PayPeriod {
  id: string
  pay_group: PayGroup
  start_date: string
  end_date: string
  payout_date: string
  status: PayPeriodStatus
  locked_at: string | null
  locked_by: string | null
  created_at: string
}

export interface PayrollEntry {
  id: string
  pay_period_id: string
  user_id: string
  basis_snapshot: SalaryBasis | null
  rate_snapshot: number | null
  present_days: number
  half_days: number
  absent_days: number
  excused_paid: number
  excused_unpaid: number
  total_hours: number
  gross: number
  advances_deducted: number
  adjustments_total: number
  net: number
  carryover: number
  rounding_mode_snapshot: RoundingMode | null
  computed_at: string | null
  paid_at: string | null
  paid_method: string | null
}

export interface PayrollAdjustment {
  id: string
  payroll_entry_id: string
  amount: number
  reason: string | null
  created_by: string | null
  created_at: string
}

export interface CashAdvance {
  id: string
  user_id: string
  amount: number
  date: string
  method: AdvanceMethod
  note: string | null
  recorded_by: string | null
  acknowledged_at: string | null
  remaining_balance: number
  created_at: string
}

// --- Vendors (Phase 5) ----------------------------------------------------

export type PaymentMethod = 'cash' | 'zelle' | 'check' | 'card' | 'other'

export type VendorPaymentStatus = 'scheduled' | 'paid' | 'overdue' | 'cancelled'

export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'zelle', 'check', 'card', 'other']

export interface Vendor {
  id: string
  name: string
  phone: string | null
  category: string | null
  notes: string | null
  active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface VendorPayment {
  id: string
  vendor_id: string
  amount: number
  due_date: string
  method: PaymentMethod
  status: VendorPaymentStatus
  event_id: string | null
  paid_at: string | null
  paid_by: string | null
  receipt_url: string | null
  notes: string | null
  reminder_days: number
  created_by: string | null
  created_at: string
  updated_at: string
}

/** A scheduled payment past its due date reads as overdue (derived, not stored). */
export function effectivePaymentStatus(
  p: Pick<VendorPayment, 'status' | 'due_date'>,
  todayIso: string,
): VendorPaymentStatus {
  if (p.status === 'scheduled' && p.due_date < todayIso) return 'overdue'
  return p.status
}

// --- Cash log + Inventory (Phase 6) ---------------------------------------

export type CashStatus = 'picked_up' | 'delivered_to_owner' | 'deposited'

export const CASH_STATUSES: CashStatus[] = ['picked_up', 'delivered_to_owner', 'deposited']

export interface CashEntry {
  id: string
  amount: number
  event_id: string | null
  picked_up_by: string | null
  handed_to: string | null
  status: CashStatus
  photo_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CashEntryLog {
  id: string
  cash_entry_id: string
  from_status: CashStatus | null
  to_status: CashStatus
  acted_by: string | null
  at: string
}

/** The next custody step, or null once deposited. */
export function nextCashStatus(status: CashStatus): CashStatus | null {
  if (status === 'picked_up') return 'delivered_to_owner'
  if (status === 'delivered_to_owner') return 'deposited'
  return null
}

export type InventoryUrgency = 'normal' | 'urgent'

export type InventoryStatus = 'requested' | 'approved' | 'rejected' | 'purchased' | 'received'

export const INVENTORY_STATUSES: InventoryStatus[] = [
  'requested',
  'approved',
  'purchased',
  'received',
  'rejected',
]

export interface InventoryRequest {
  id: string
  item: string
  qty: number | null
  unit: string | null
  urgency: InventoryUrgency
  needed_by: string | null
  event_id: string | null
  status: InventoryStatus
  requested_by: string | null
  decided_by: string | null
  photo_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type CommentEntity = 'cash' | 'inventory' | 'vendor_payment' | 'advance'

export interface Comment {
  id: string
  entity_type: CommentEntity
  entity_id: string
  sender_id: string | null
  body: string
  created_at: string
}

// --- Notifications (Phase 7) ----------------------------------------------

export interface AppNotification {
  id: string
  user_id: string
  type: string
  payload: { title?: string; body?: string; url?: string; [k: string]: unknown }
  read: boolean
  created_at: string
}
