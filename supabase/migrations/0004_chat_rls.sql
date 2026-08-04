-- ============================================================================
-- Phase 1 — RLS for chat, plus expanded team visibility.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Team visibility: signed-in users can see each other's basic profile so chat
-- senders and the team roster render. Salary/rate data lives in separate tables
-- (added in Phase 4) which stay owner-only; nothing sensitive is exposed here.
-- ---------------------------------------------------------------------------
drop policy if exists users_select_authenticated on public.users;
create policy users_select_authenticated on public.users
  for select
  to authenticated
  using (true);

-- The self/owner SELECT policies from migration 0002 are now redundant supersets
-- of the above but harmless (policies are OR-ed); leaving them keeps intent clear.

-- ---------------------------------------------------------------------------
-- channels
-- ---------------------------------------------------------------------------
alter table public.channels enable row level security;
alter table public.channels force row level security;

drop policy if exists channels_select_member on public.channels;
drop policy if exists channels_insert_creator on public.channels;
drop policy if exists channels_update_manager on public.channels;
drop policy if exists channels_delete_owner on public.channels;

-- See a channel only if you're a member (owner sees all for administration).
create policy channels_select_member on public.channels
  for select
  using (public.is_channel_member(id) or public.is_owner());

-- Only create_channels holders may create channels; auto channels are seeded by
-- migrations and Edge Functions (service role bypasses RLS).
create policy channels_insert_creator on public.channels
  for insert
  with check (public.app_has_permission('create_channels'));

-- Rename/archive: the creator (with create_channels) or the owner.
create policy channels_update_manager on public.channels
  for update
  using (
    public.is_owner()
    or (public.app_has_permission('create_channels') and created_by = public.current_app_user_id())
  )
  with check (
    public.is_owner()
    or (public.app_has_permission('create_channels') and created_by = public.current_app_user_id())
  );

create policy channels_delete_owner on public.channels
  for delete
  using (public.is_owner());

-- ---------------------------------------------------------------------------
-- channel_members
-- ---------------------------------------------------------------------------
alter table public.channel_members enable row level security;
alter table public.channel_members force row level security;

drop policy if exists channel_members_select on public.channel_members;
drop policy if exists channel_members_insert on public.channel_members;
drop policy if exists channel_members_delete on public.channel_members;

-- See the member list of channels you belong to (owner sees all).
create policy channel_members_select on public.channel_members
  for select
  using (public.is_channel_member(channel_id) or public.is_owner());

-- Add members: owner, or a create_channels holder who is already in the channel.
-- Special case: a channel's creator may add themselves as the first member
-- (they aren't a member yet at that instant, so is_channel_member is false).
create policy channel_members_insert on public.channel_members
  for insert
  with check (
    public.is_owner()
    or (public.app_has_permission('create_channels') and public.is_channel_member(channel_id))
    or (
      user_id = public.current_app_user_id()
      and exists (
        select 1 from public.channels c
        where c.id = channel_id and c.created_by = public.current_app_user_id()
      )
    )
  );

-- Remove members: owner, or a create_channels holder in the channel. Users may
-- also remove themselves (leave).
create policy channel_members_delete on public.channel_members
  for delete
  using (
    public.is_owner()
    or (public.app_has_permission('create_channels') and public.is_channel_member(channel_id))
    or user_id = public.current_app_user_id()
  );

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
alter table public.messages enable row level security;
alter table public.messages force row level security;

drop policy if exists messages_select_member on public.messages;
drop policy if exists messages_insert_member on public.messages;
drop policy if exists messages_update_own on public.messages;

-- Read only within channels you're a member of. Removal revokes history because
-- the membership row is gone (spec §3.3).
create policy messages_select_member on public.messages
  for select
  using (public.is_channel_member(channel_id));

-- Send as yourself into a channel you belong to. System messages are inserted by
-- SECURITY DEFINER triggers (service context), not by clients.
create policy messages_insert_member on public.messages
  for insert
  with check (
    kind = 'user'
    and sender_id = public.current_app_user_id()
    and public.is_channel_member(channel_id)
  );

-- Edit/soft-delete your own message; the owner can delete any (spec §4.8).
create policy messages_update_own on public.messages
  for update
  using (
    public.is_channel_member(channel_id)
    and (sender_id = public.current_app_user_id() or public.is_owner())
  )
  with check (
    public.is_channel_member(channel_id)
    and (sender_id = public.current_app_user_id() or public.is_owner())
  );

-- ---------------------------------------------------------------------------
-- message_reads (own rows only)
-- ---------------------------------------------------------------------------
alter table public.message_reads enable row level security;
alter table public.message_reads force row level security;

drop policy if exists message_reads_all_own on public.message_reads;
create policy message_reads_all_own on public.message_reads
  for all
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

-- ---------------------------------------------------------------------------
-- Storage: private bucket for chat image attachments. Object paths are
-- `{channel_id}/{filename}`; access is gated by channel membership.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('chat-attachments', 'chat-attachments', false)
  on conflict (id) do nothing;

drop policy if exists chat_attachments_read on storage.objects;
drop policy if exists chat_attachments_write on storage.objects;

create policy chat_attachments_read on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'chat-attachments'
    and public.is_channel_member((split_part(name, '/', 1))::uuid)
  );

create policy chat_attachments_write on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and public.is_channel_member((split_part(name, '/', 1))::uuid)
  );
