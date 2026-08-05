// Cash log, inventory requests, and shared comment threads (Phase 6).
// All access is additionally enforced by RLS.
import { supabase } from './supabase'
import type {
  CashEntry,
  CashEntryLog,
  CashStatus,
  Comment,
  CommentEntity,
  InventoryRequest,
  InventoryStatus,
  InventoryUrgency,
} from './types'

// --- Cash entries ---------------------------------------------------------

export async function listCashEntries(): Promise<CashEntry[]> {
  const { data, error } = await supabase
    .from('cash_entries')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as CashEntry[]
}

export async function createCashEntry(input: {
  amount: number
  event_id?: string | null
  notes?: string | null
  photo_url?: string | null
  picked_up_by: string
}): Promise<CashEntry> {
  const { data, error } = await supabase
    .from('cash_entries')
    .insert({
      amount: input.amount,
      event_id: input.event_id ?? null,
      notes: input.notes ?? null,
      photo_url: input.photo_url ?? null,
      picked_up_by: input.picked_up_by,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as CashEntry
}

/** Advance the custody chain (owner confirms receipt / deposit). */
export async function setCashStatus(
  id: string,
  status: CashStatus,
  handedTo?: string | null,
): Promise<void> {
  const patch: Record<string, unknown> = { status }
  if (handedTo !== undefined) patch.handed_to = handedTo
  const { error } = await supabase.from('cash_entries').update(patch).eq('id', id)
  if (error) throw error
}

export async function listCashLog(entryId: string): Promise<CashEntryLog[]> {
  const { data, error } = await supabase
    .from('cash_entry_log')
    .select('*')
    .eq('cash_entry_id', entryId)
    .order('at')
  if (error) throw error
  return (data ?? []) as CashEntryLog[]
}

// --- Inventory requests ---------------------------------------------------

export async function listInventory(): Promise<InventoryRequest[]> {
  const { data, error } = await supabase
    .from('inventory_requests')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as InventoryRequest[]
}

export async function createInventory(input: {
  item: string
  qty?: number | null
  unit?: string | null
  urgency: InventoryUrgency
  needed_by?: string | null
  event_id?: string | null
  notes?: string | null
  photo_url?: string | null
  requested_by: string
}): Promise<InventoryRequest> {
  const { data, error } = await supabase
    .from('inventory_requests')
    .insert({
      item: input.item,
      qty: input.qty ?? null,
      unit: input.unit ?? null,
      urgency: input.urgency,
      needed_by: input.needed_by ?? null,
      event_id: input.event_id ?? null,
      notes: input.notes ?? null,
      photo_url: input.photo_url ?? null,
      requested_by: input.requested_by,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as InventoryRequest
}

/** Approve / reject / mark purchased / received (approve_inventory holders). */
export async function decideInventory(
  id: string,
  status: InventoryStatus,
  decidedBy: string,
): Promise<void> {
  const { error } = await supabase
    .from('inventory_requests')
    .update({ status, decided_by: decidedBy })
    .eq('id', id)
  if (error) throw error
}

// --- Comments (shared thread) ---------------------------------------------

export async function listComments(
  entityType: CommentEntity,
  entityId: string,
): Promise<Comment[]> {
  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at')
  if (error) throw error
  return (data ?? []) as Comment[]
}

export async function addComment(
  entityType: CommentEntity,
  entityId: string,
  senderId: string,
  body: string,
): Promise<void> {
  const { error } = await supabase.from('comments').insert({
    entity_type: entityType,
    entity_id: entityId,
    sender_id: senderId,
    body,
  })
  if (error) throw error
}

export async function deleteComment(id: string): Promise<void> {
  const { error } = await supabase.from('comments').delete().eq('id', id)
  if (error) throw error
}

// --- Photos ---------------------------------------------------------------

const OPS_BUCKET = 'ops-photos'

export async function uploadOpsPhoto(kind: 'cash' | 'inventory', file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `${kind}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from(OPS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  const { data, error: signErr } = await supabase.storage
    .from(OPS_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365)
  if (signErr) throw signErr
  return data.signedUrl
}
