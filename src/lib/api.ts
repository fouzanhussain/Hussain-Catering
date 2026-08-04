// Thin data-access layer over Supabase for Phase 1 (team + chat).
// All access is additionally gated by RLS; these helpers just shape queries.
import { supabase } from './supabase'
import type {
  Attendance,
  AttendanceStatus,
  Channel,
  Message,
  Permissions,
  Role,
  RoundingMode,
  PayGroup,
  SalaryBasis,
  UserProfile,
} from './types'

// --- Users / team ---------------------------------------------------------

export async function listUsers(includeInactive = true): Promise<UserProfile[]> {
  let q = supabase.from('users').select('*').order('name')
  if (!includeInactive) q = q.eq('active', true)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as UserProfile[]
}

export interface UpsertUserInput {
  name: string
  phone: string
  email?: string | null
  role: Role
  language: string
  permissions?: Partial<Permissions>
  pay_group?: PayGroup | null
  pay_basis?: SalaryBasis | null
  rounding_mode?: RoundingMode
  hire_date?: string | null
  active?: boolean
}

/** Owner invites a teammate by pre-creating their profile (auth links on OTP). */
export async function createUser(input: UpsertUserInput): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('users')
    .insert({
      name: input.name,
      phone: input.phone,
      email: input.email ?? null,
      role: input.role,
      language: input.language,
      permissions: input.permissions ?? {},
      pay_group: input.pay_group ?? null,
      pay_basis: input.pay_basis ?? null,
      rounding_mode: input.rounding_mode ?? 'cent',
      hire_date: input.hire_date ?? null,
      active: input.active ?? true,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as UserProfile
}

export async function updateUser(
  id: string,
  patch: Partial<UpsertUserInput>,
): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('users')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as UserProfile
}

export async function setUserActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('users').update({ active }).eq('id', id)
  if (error) throw error
}

// --- Channels -------------------------------------------------------------

export async function listMyChannels(): Promise<Channel[]> {
  // RLS returns only channels the caller is a member of (or all, for the owner).
  const { data, error } = await supabase
    .from('channels')
    .select('*')
    .eq('archived', false)
    .order('type')
    .order('name')
  if (error) throw error
  return (data ?? []) as Channel[]
}

export async function fetchUnreadCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('channel_unread_counts')
  if (error) throw error
  const map: Record<string, number> = {}
  for (const row of (data ?? []) as { channel_id: string; unread: number }[]) {
    map[row.channel_id] = row.unread
  }
  return map
}

export async function createChannel(name: string, createdBy: string): Promise<Channel> {
  const { data, error } = await supabase
    .from('channels')
    .insert({ name, type: 'custom', created_by: createdBy })
    .select('*')
    .single()
  if (error) throw error
  const channel = data as Channel
  // Creator joins their own channel.
  await addChannelMember(channel.id, createdBy, createdBy)
  return channel
}

export async function listChannelMemberIds(channelId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('channel_members')
    .select('user_id')
    .eq('channel_id', channelId)
  if (error) throw error
  return (data ?? []).map((r) => (r as { user_id: string }).user_id)
}

export async function addChannelMember(
  channelId: string,
  userId: string,
  addedBy: string,
): Promise<void> {
  const { error } = await supabase
    .from('channel_members')
    .upsert(
      { channel_id: channelId, user_id: userId, added_by: addedBy },
      { onConflict: 'channel_id,user_id', ignoreDuplicates: true },
    )
  if (error) throw error
}

export async function removeChannelMember(channelId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('channel_members')
    .delete()
    .eq('channel_id', channelId)
    .eq('user_id', userId)
  if (error) throw error
}

// --- Messages -------------------------------------------------------------

export async function listMessages(channelId: string, limit = 100): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  // Return chronological (oldest first) for rendering.
  return ((data ?? []) as Message[]).reverse()
}

export async function sendMessage(
  channelId: string,
  senderId: string,
  body: string | null,
  attachmentUrl: string | null = null,
): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      channel_id: channelId,
      sender_id: senderId,
      kind: 'user',
      body,
      attachment_url: attachmentUrl,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as Message
}

/** Soft-delete a message (own message, or any if owner — enforced by RLS). */
export async function deleteMessage(id: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ deleted: true, body: null, attachment_url: null })
    .eq('id', id)
  if (error) throw error
}

export async function markChannelRead(channelId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('message_reads')
    .upsert(
      { channel_id: channelId, user_id: userId, last_read_at: new Date().toISOString() },
      { onConflict: 'channel_id,user_id' },
    )
  if (error) throw error
}

// --- Attachments ----------------------------------------------------------

const ATTACHMENT_BUCKET = 'chat-attachments'

/** Upload an image into the channel-scoped path and return a display URL. */
export async function uploadAttachment(channelId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `${channelId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  // Private bucket → signed URL (valid for a week; refreshed on next fetch).
  const { data, error: signErr } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7)
  if (signErr) throw signErr
  return data.signedUrl
}

// --- Attendance (Phase 2) -------------------------------------------------

export async function listAttendanceByDate(date: string): Promise<Attendance[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('date', date)
  if (error) throw error
  return (data ?? []) as Attendance[]
}

export async function listAttendanceForUser(
  userId: string,
  start: string,
  end: string,
): Promise<Attendance[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('user_id', userId)
    .gte('date', start)
    .lte('date', end)
    .order('date', { ascending: false })
  if (error) throw error
  return (data ?? []) as Attendance[]
}

export interface AttendanceInput {
  user_id: string
  date: string
  status: AttendanceStatus
  check_in_at?: string | null
  check_out_at?: string | null
  break_minutes?: number
  edit_reason?: string | null
}

/**
 * Create or update the attendance row for an employee on a date. Uses the
 * (user_id, date) unique key. marked_by/edited_by are stamped server-side.
 */
export async function upsertAttendance(input: AttendanceInput): Promise<Attendance> {
  const row = {
    user_id: input.user_id,
    date: input.date,
    status: input.status,
    check_in_at: input.check_in_at ?? null,
    check_out_at: input.check_out_at ?? null,
    break_minutes: input.break_minutes ?? 0,
    edit_reason: input.edit_reason ?? null,
  }
  const { data, error } = await supabase
    .from('attendance')
    .upsert(row, { onConflict: 'user_id,date' })
    .select('*')
    .single()
  if (error) throw error
  return data as Attendance
}
