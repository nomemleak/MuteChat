-- =========================================================================
-- Migration 0001 — Fix the infinite recursion in the RLS policies
-- =========================================================================
-- Fixed error:
--   "infinite recursion detected in policy for relation conversation_participants"
--
--   The old SELECT policy on `conversation_participants` ran
--   `exists (select ... from conversation_participants ...)`. To evaluate that
--   subquery, PostgreSQL has to apply the table's policy... which runs the
--   same subquery again. Infinite loop.
--   Same between `conversations` and `conversation_participants` (mutual
--   recursion).
--
-- Solution:
--   Membership checks go through SECURITY DEFINER functions. They run with
--   the owner's rights, so outside RLS: no policy is evaluated again, and
--   there is no loop anymore.
--
-- This migration is NON-DESTRUCTIVE: no table is dropped, existing accounts
-- and messages are kept. Run it in the Supabase SQL Editor.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. Helper functions (SECURITY DEFINER = outside RLS)
-- -------------------------------------------------------------------------

-- True when the given user belongs to the given conversation.
create or replace function public.is_conversation_participant(
  p_conversation_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = p_conversation_id
      and cp.user_id = p_user_id
  );
$$;

comment on function public.is_conversation_participant(uuid, uuid) is
  'Conversation membership check, outside RLS, to avoid recursive policies.';

-- True when both users are friends (accepted request), whichever direction
-- the request went.
create or replace function public.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.friendships f
    where f.status = 'accepted'
      and (
        (f.user_id_1 = p_a and f.user_id_2 = p_b) or
        (f.user_id_1 = p_b and f.user_id_2 = p_a)
      )
  );
$$;

-- Ordered pair, used to make a friendship unique in both directions.
create or replace function public.pair_low(p_a uuid, p_b uuid)
returns uuid language sql immutable parallel safe
as $$ select case when p_a < p_b then p_a else p_b end $$;

create or replace function public.pair_high(p_a uuid, p_b uuid)
returns uuid language sql immutable parallel safe
as $$ select case when p_a < p_b then p_b else p_a end $$;

-- -------------------------------------------------------------------------
-- 2. Data integrity
-- -------------------------------------------------------------------------

-- Nobody can be friends with themselves.
alter table public.friendships
  drop constraint if exists friendships_distinct_users;
alter table public.friendships
  add constraint friendships_distinct_users
  check (user_id_1 <> user_id_2) not valid;

-- A single relationship per pair, whichever the direction
-- (the old unique(user_id_1, user_id_2) constraint let both A→B and B→A in).
-- Clean up mirrored duplicates first: the oldest one is kept.
delete from public.friendships f
using public.friendships g
where public.pair_low(f.user_id_1, f.user_id_2) = public.pair_low(g.user_id_1, g.user_id_2)
  and public.pair_high(f.user_id_1, f.user_id_2) = public.pair_high(g.user_id_1, g.user_id_2)
  and (f.created_at, f.id) > (g.created_at, g.id);

create unique index if not exists friendships_unique_pair_idx
  on public.friendships (
    public.pair_low(user_id_1, user_id_2),
    public.pair_high(user_id_1, user_id_2)
  );

-- Read indexes
create index if not exists friendships_user_id_1_idx on public.friendships (user_id_1);
create index if not exists friendships_user_id_2_idx on public.friendships (user_id_2);
create index if not exists conversation_participants_user_id_idx
  on public.conversation_participants (user_id);
create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

-- Username format (NOT VALID: existing accounts are not rejected).
alter table public.profiles
  drop constraint if exists profiles_username_format;
alter table public.profiles
  add constraint profiles_username_format
  check (username ~ '^[A-Za-z0-9._-]{3,20}$') not valid;

-- Case-insensitive username lookup
create index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

-- -------------------------------------------------------------------------
-- 3. Rewritten RLS policies
-- -------------------------------------------------------------------------

alter table public.profiles                enable row level security;
alter table public.friendships             enable row level security;
alter table public.conversations           enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages                enable row level security;

-- The French policy names below come from the very first version of the
-- schema: they are dropped so they can be replaced by the new policies.

-- Profiles ---------------------------------------------------------------
drop policy if exists "Les profils sont visibles par tous" on public.profiles;
drop policy if exists "Un utilisateur peut créer son profil" on public.profiles;
drop policy if exists "Un utilisateur peut modifier son profil" on public.profiles;
drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_insert_self" on public.profiles;
drop policy if exists "profiles_update_self" on public.profiles;

-- Readable by signed-in members only (needed for the username lookup) —
-- no longer by anonymous visitors as before.
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);

create policy "profiles_insert_self" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

create policy "profiles_update_self" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Friendships ------------------------------------------------------------
drop policy if exists "Voir ses propres demandes/amis" on public.friendships;
drop policy if exists "Créer une demande d'ami" on public.friendships;
drop policy if exists "Accepter une demande d'ami" on public.friendships;
drop policy if exists "friendships_select" on public.friendships;
drop policy if exists "friendships_insert" on public.friendships;
drop policy if exists "friendships_update_accept" on public.friendships;
drop policy if exists "friendships_delete" on public.friendships;

create policy "friendships_select" on public.friendships
  for select to authenticated
  using (auth.uid() = user_id_1 or auth.uid() = user_id_2);

create policy "friendships_insert" on public.friendships
  for insert to authenticated
  with check (auth.uid() = user_id_1 and user_id_2 <> auth.uid() and status = 'pending');

-- Only the recipient can accept.
create policy "friendships_update_accept" on public.friendships
  for update to authenticated
  using (auth.uid() = user_id_2)
  with check (auth.uid() = user_id_2 and status = 'accepted');

-- Either side can decline / remove.
create policy "friendships_delete" on public.friendships
  for delete to authenticated
  using (auth.uid() = user_id_1 or auth.uid() = user_id_2);

-- Conversations -----------------------------------------------------------
drop policy if exists "Voir ses conversations" on public.conversations;
drop policy if exists "Créer une conversation" on public.conversations;
drop policy if exists "conversations_select" on public.conversations;

-- No INSERT policy anymore: creation only goes through the
-- get_or_create_direct_conversation() function below, which is atomic.
create policy "conversations_select" on public.conversations
  for select to authenticated
  using (public.is_conversation_participant(id));

-- Participants ------------------------------------------------------------
drop policy if exists "Voir les participants de ses conversations" on public.conversation_participants;
drop policy if exists "Ajouter un participant" on public.conversation_participants;
drop policy if exists "conversation_participants_select" on public.conversation_participants;

-- THIS is where the recursion was. The subquery is replaced by a call to
-- the SECURITY DEFINER function.
create policy "conversation_participants_select" on public.conversation_participants
  for select to authenticated
  using (public.is_conversation_participant(conversation_id));

-- No INSERT/UPDATE/DELETE policy: the old `with check (true)` let anyone
-- invite themselves into any conversation.

-- Messages ----------------------------------------------------------------
drop policy if exists "Voir les messages de ses conversations" on public.messages;
drop policy if exists "Envoyer un message" on public.messages;
drop policy if exists "messages_select" on public.messages;
drop policy if exists "messages_insert" on public.messages;
drop policy if exists "messages_delete_own" on public.messages;

create policy "messages_select" on public.messages
  for select to authenticated
  using (public.is_conversation_participant(conversation_id));

create policy "messages_insert" on public.messages
  for insert to authenticated
  with check (
    auth.uid() = sender_id
    and public.is_conversation_participant(conversation_id)
  );

create policy "messages_delete_own" on public.messages
  for delete to authenticated
  using (auth.uid() = sender_id);

-- -------------------------------------------------------------------------
-- 4. Atomic server-side operations (RPC)
-- -------------------------------------------------------------------------

-- Returns the one-to-one conversation with a friend, or creates it.
-- An advisory lock on the pair prevents two duplicate conversations when the
-- user opens two tabs.
create or replace function public.get_or_create_direct_conversation(p_friend_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me   uuid := auth.uid();
  v_conv uuid;
begin
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_friend_id = v_me then
    raise exception 'You cannot open a conversation with yourself' using errcode = '22023';
  end if;

  if not public.are_friends(v_me, p_friend_id) then
    raise exception 'You are not friends with this user' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      public.pair_low(v_me, p_friend_id)::text ||
      public.pair_high(v_me, p_friend_id)::text,
      0
    )
  );

  select cp.conversation_id
    into v_conv
  from public.conversation_participants cp
  join public.conversation_participants other
    on other.conversation_id = cp.conversation_id
   and other.user_id = p_friend_id
  where cp.user_id = v_me
    and (
      select count(*) from public.conversation_participants x
      where x.conversation_id = cp.conversation_id
    ) = 2
  limit 1;

  if v_conv is not null then
    return v_conv;
  end if;

  insert into public.conversations default values returning id into v_conv;
  insert into public.conversation_participants (conversation_id, user_id)
  values (v_conv, v_me), (v_conv, p_friend_id);

  return v_conv;
end;
$$;

-- Sends a friend request from a username, handling both directions of the
-- relationship and the business errors in a single transaction.
-- Returns: 'sent' | 'already_friends' | 'already_pending' | 'accepted'
create or replace function public.send_friend_request(p_username text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me     uuid := auth.uid();
  v_target uuid;
  v_row    public.friendships%rowtype;
begin
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select id into v_target
  from public.profiles
  where lower(username) = lower(trim(p_username))
  limit 1;

  if v_target is null then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  if v_target = v_me then
    raise exception 'You cannot add yourself' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      public.pair_low(v_me, v_target)::text ||
      public.pair_high(v_me, v_target)::text,
      0
    )
  );

  select * into v_row
  from public.friendships f
  where (f.user_id_1 = v_me and f.user_id_2 = v_target)
     or (f.user_id_1 = v_target and f.user_id_2 = v_me)
  limit 1;

  if found then
    if v_row.status = 'accepted' then
      return 'already_friends';
    end if;

    -- The other user had already sent us a request: accept it.
    if v_row.user_id_2 = v_me then
      update public.friendships set status = 'accepted' where id = v_row.id;
      return 'accepted';
    end if;

    return 'already_pending';
  end if;

  insert into public.friendships (user_id_1, user_id_2, status)
  values (v_me, v_target, 'pending');

  return 'sent';
end;
$$;

-- Execute rights: signed-in users only.
revoke all on function public.is_conversation_participant(uuid, uuid)   from public, anon;
revoke all on function public.are_friends(uuid, uuid)                   from public, anon;
revoke all on function public.get_or_create_direct_conversation(uuid)   from public, anon;
revoke all on function public.send_friend_request(text)                 from public, anon;

grant execute on function public.is_conversation_participant(uuid, uuid) to authenticated;
grant execute on function public.are_friends(uuid, uuid)                 to authenticated;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;
grant execute on function public.send_friend_request(text)               to authenticated;

-- -------------------------------------------------------------------------
-- 5. Profile creation on sign-up
-- -------------------------------------------------------------------------
-- The chosen username is passed through the signUp metadata.
-- The app code no longer inserts the profile itself: it clashed with this
-- trigger (primary key violation on the second insert).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  base_username  text;
  final_username text;
  counter        integer := 0;
begin
  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;

  base_username := coalesce(
    nullif(trim(new.raw_user_meta_data->>'username'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'user'
  );

  -- Strip characters the username format constraint would reject
  base_username := regexp_replace(base_username, '[^A-Za-z0-9._-]', '', 'g');
  if length(base_username) < 3 then
    base_username := base_username || 'user';
  end if;
  base_username := left(base_username, 20);

  final_username := base_username;

  while exists (select 1 from public.profiles where lower(username) = lower(final_username)) loop
    counter := counter + 1;
    final_username := left(base_username, 20 - length(counter::text)) || counter::text;
  end loop;

  insert into public.profiles (id, username, avatar_url)
  values (new.id, final_username, new.raw_user_meta_data->>'avatar_url');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -------------------------------------------------------------------------
-- 6. Realtime
-- -------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friendships'
  ) then
    alter publication supabase_realtime add table public.friendships;
  end if;
end
$$;

commit;
