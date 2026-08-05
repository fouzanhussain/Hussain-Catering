// Vendor payment planner data access (Phase 5). All access is additionally
// gated by RLS to manage_vendors holders.
import { supabase } from './supabase'
import type { PaymentMethod, Vendor, VendorPayment } from './types'

// --- Vendors --------------------------------------------------------------

export async function listVendors(includeInactive = true): Promise<Vendor[]> {
  let q = supabase.from('vendors').select('*').order('name')
  if (!includeInactive) q = q.eq('active', true)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as Vendor[]
}

export interface VendorInput {
  name: string
  phone?: string | null
  category?: string | null
  notes?: string | null
  active?: boolean
}

export async function createVendor(input: VendorInput, createdBy: string): Promise<Vendor> {
  const { data, error } = await supabase
    .from('vendors')
    .insert({ ...normalizeVendor(input), created_by: createdBy })
    .select('*')
    .single()
  if (error) throw error
  return data as Vendor
}

export async function updateVendor(id: string, input: VendorInput): Promise<Vendor> {
  const { data, error } = await supabase
    .from('vendors')
    .update(normalizeVendor(input))
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as Vendor
}

export async function setVendorActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('vendors').update({ active }).eq('id', id)
  if (error) throw error
}

function normalizeVendor(input: VendorInput) {
  return {
    name: input.name,
    phone: input.phone ?? null,
    category: input.category ?? null,
    notes: input.notes ?? null,
    ...(input.active != null ? { active: input.active } : {}),
  }
}

// --- Payments -------------------------------------------------------------

export interface PaymentFilter {
  vendorId?: string
  from?: string
  to?: string
}

export async function listPayments(filter: PaymentFilter = {}): Promise<VendorPayment[]> {
  let q = supabase.from('vendor_payments').select('*').order('due_date')
  if (filter.vendorId) q = q.eq('vendor_id', filter.vendorId)
  if (filter.from) q = q.gte('due_date', filter.from)
  if (filter.to) q = q.lte('due_date', filter.to)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as VendorPayment[]
}

export interface PaymentInput {
  vendor_id: string
  amount: number
  due_date: string
  method: PaymentMethod
  event_id?: string | null
  notes?: string | null
  reminder_days?: number
}

export async function createPayment(input: PaymentInput, createdBy: string): Promise<VendorPayment> {
  const { data, error } = await supabase
    .from('vendor_payments')
    .insert({
      vendor_id: input.vendor_id,
      amount: input.amount,
      due_date: input.due_date,
      method: input.method,
      event_id: input.event_id ?? null,
      notes: input.notes ?? null,
      reminder_days: input.reminder_days ?? 2,
      created_by: createdBy,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as VendorPayment
}

export async function updatePayment(id: string, input: PaymentInput): Promise<VendorPayment> {
  const { data, error } = await supabase
    .from('vendor_payments')
    .update({
      vendor_id: input.vendor_id,
      amount: input.amount,
      due_date: input.due_date,
      method: input.method,
      event_id: input.event_id ?? null,
      notes: input.notes ?? null,
      reminder_days: input.reminder_days ?? 2,
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as VendorPayment
}

/** Mark a scheduled payment paid, recording the actor + timestamp (spec §4.4). */
export async function markPaymentPaid(
  id: string,
  method: PaymentMethod,
  paidBy: string,
  receiptUrl?: string | null,
): Promise<void> {
  const patch: Record<string, unknown> = {
    status: 'paid',
    method,
    paid_at: new Date().toISOString(),
    paid_by: paidBy,
  }
  if (receiptUrl !== undefined) patch.receipt_url = receiptUrl
  const { error } = await supabase.from('vendor_payments').update(patch).eq('id', id)
  if (error) throw error
}

export async function cancelPayment(id: string): Promise<void> {
  const { error } = await supabase
    .from('vendor_payments')
    .update({ status: 'cancelled' })
    .eq('id', id)
  if (error) throw error
}

const RECEIPT_BUCKET = 'vendor-receipts'

export async function uploadReceipt(paymentId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `${paymentId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  const { data, error: signErr } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365)
  if (signErr) throw signErr
  return data.signedUrl
}
