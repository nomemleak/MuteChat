-- =========================================================================
-- MuteChat — Full schema
-- =========================================================================
-- Idempotent install script: it can be run again without losing anything.
-- It does NOT drop existing tables.
--
-- For a database already in production, run the files in `migrations/`
-- instead: they lead to the same final state.
--
-- To start from scratch (destructive, deletes everything):
--   drop table if exists public.push_subscriptions, public.messages,
--     public.conversation_participants, public.conversations,
--     public.friendships, public.profiles cascade;
-- then run this script.
-- =========================================================================

begin;

-- =========================================================================
-- TABLES
-- =========================================================================

create table if not exists public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  username   text unique not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.friendships (
  id         uuid primary key default gen_random_uuid(),
  user_id_1  uuid not null references public.profiles(id) on delete cascade, -- sender
  user_id_2  uuid not null references public.profiles(id) on delete cascade, -- recipient
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (user_id_1, user_id_2)
);

create table if not exists public.conversations (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- For databases created before read tracking was added
alter table public.conversation_participants
  add column if not exists last_read_at timestamptz not null default now();

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth_key   text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id) on delete cascade,
  gif_url         text not null,
  created_at      timestamptz not null default now()
);

-- -------------------------------------------------------------------------
-- 0. Date defaults
-- -------------------------------------------------------------------------
-- The original tables used `timezone('utc'::text, now())` as their default.
-- That expression returns a timestamp WITHOUT a time zone holding the UTC
-- wall-clock time; stored into a `timestamptz` column, it is reinterpreted in
-- the session's time zone, so it drifts whenever the session is not in UTC.
--
-- Direct consequence: `messages.created_at` ended up BEFORE `last_read_at`
-- (which uses `now()`), and the unread counter stayed stuck at zero. Verified
-- on PostgreSQL 16 in a Europe/Paris session: 3 unread messages counted as 0.
--
-- Existing rows are left untouched: Supabase connections run in UTC, where
-- both expressions give the same instant.
alter table public.messages      alter column created_at set default now();
alter table public.profiles      alter column created_at set default now();
alter table public.friendships   alter column created_at set default now();
alter table public.conversations alter column created_at set default now();

-- =========================================================================
-- CONSTRAINTS AND INDEXES
-- =========================================================================

alter table public.friendships drop constraint if exists friendships_distinct_users;
alter table public.friendships add constraint friendships_distinct_users
  check (user_id_1 <> user_id_2) not valid;

alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles add constraint profiles_username_format
  check (username ~ '^[A-Za-z0-9._-]{3,20}$') not valid;

-- Ordered pair: makes a friendship unique in both directions.
create or replace function public.pair_low(p_a uuid, p_b uuid)
returns uuid language sql immutable parallel safe
as $$ select case when p_a < p_b then p_a else p_b end $$;

create or replace function public.pair_high(p_a uuid, p_b uuid)
returns uuid language sql immutable parallel safe
as $$ select case when p_a < p_b then p_b else p_a end $$;

create unique index if not exists friendships_unique_pair_idx
  on public.friendships (
    public.pair_low(user_id_1, user_id_2),
    public.pair_high(user_id_1, user_id_2)
  );

create index if not exists friendships_user_id_1_idx        on public.friendships (user_id_1);
create index if not exists friendships_user_id_2_idx        on public.friendships (user_id_2);
create index if not exists profiles_username_lower_idx      on public.profiles (lower(username));
create index if not exists conversation_participants_user_id_idx
  on public.conversation_participants (user_id);
create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);
create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

-- =========================================================================
-- HELPER FUNCTIONS (SECURITY DEFINER → they run outside RLS)
-- =========================================================================
-- Essential: an RLS policy that queries its own table in a subquery triggers
-- "infinite recursion detected in policy". Going through a SECURITY DEFINER
-- function means the policy is not evaluated again, and the loop is gone.

create or replace function public.is_conversation_participant(
  p_conversation_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = p_conversation_id
      and cp.user_id = p_user_id
  );
$$;

create or replace function public.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and (
        (f.user_id_1 = p_a and f.user_id_2 = p_b) or
        (f.user_id_1 = p_b and f.user_id_2 = p_a)
      )
  );
$$;

-- =========================================================================
-- AUTOMATIC PROFILE CREATION
-- =========================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
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

-- =========================================================================
-- ROW LEVEL SECURITY
-- =========================================================================

alter table public.profiles                  enable row level security;
alter table public.friendships               enable row level security;
alter table public.conversations             enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages                  enable row level security;
alter table public.push_subscriptions        enable row level security;

-- Profiles ---------------------------------------------------------------
drop policy if exists "profiles_select"      on public.profiles;
drop policy if exists "profiles_insert_self" on public.profiles;
drop policy if exists "profiles_update_self" on public.profiles;

create policy "profiles_select" on public.profiles
  for select to authenticated using (true);

create policy "profiles_insert_self" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

create policy "profiles_update_self" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Friendships ------------------------------------------------------------
drop policy if exists "friendships_select"        on public.friendships;
drop policy if exists "friendships_insert"        on public.friendships;
drop policy if exists "friendships_update_accept" on public.friendships;
drop policy if exists "friendships_delete"        on public.friendships;

create policy "friendships_select" on public.friendships
  for select to authenticated
  using (auth.uid() = user_id_1 or auth.uid() = user_id_2);

create policy "friendships_insert" on public.friendships
  for insert to authenticated
  with check (auth.uid() = user_id_1 and user_id_2 <> auth.uid() and status = 'pending');

create policy "friendships_update_accept" on public.friendships
  for update to authenticated
  using (auth.uid() = user_id_2)
  with check (auth.uid() = user_id_2 and status = 'accepted');

create policy "friendships_delete" on public.friendships
  for delete to authenticated
  using (auth.uid() = user_id_1 or auth.uid() = user_id_2);

-- Conversations & participants --------------------------------------------
-- No INSERT policy: creation goes through
-- get_or_create_direct_conversation(), which is atomic and checked.
drop policy if exists "conversations_select"              on public.conversations;
drop policy if exists "conversation_participants_select"  on public.conversation_participants;

create policy "conversations_select" on public.conversations
  for select to authenticated
  using (public.is_conversation_participant(id));

create policy "conversation_participants_select" on public.conversation_participants
  for select to authenticated
  using (public.is_conversation_participant(conversation_id));

-- Messages ----------------------------------------------------------------
drop policy if exists "messages_select"     on public.messages;
drop policy if exists "messages_insert"     on public.messages;
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

-- Push subscriptions -----------------------------------------------------
drop policy if exists "push_subscriptions_own" on public.push_subscriptions;

create policy "push_subscriptions_own" on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =========================================================================
-- RPC
-- =========================================================================

create or replace function public.get_or_create_direct_conversation(p_friend_id uuid)
returns uuid
language plpgsql security definer
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

-- Returns: 'sent' | 'already_friends' | 'already_pending' | 'accepted'
create or replace function public.send_friend_request(p_username text)
returns text
language plpgsql security definer
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

revoke all on function public.is_conversation_participant(uuid, uuid)   from public, anon;
revoke all on function public.are_friends(uuid, uuid)                   from public, anon;
revoke all on function public.get_or_create_direct_conversation(uuid)   from public, anon;
revoke all on function public.send_friend_request(text)                 from public, anon;

grant execute on function public.is_conversation_participant(uuid, uuid) to authenticated;
grant execute on function public.are_friends(uuid, uuid)                 to authenticated;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;
grant execute on function public.send_friend_request(text)               to authenticated;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  update public.conversation_participants
     set last_read_at = now()
   where conversation_id = p_conversation_id
     and user_id = auth.uid();
end;
$$;

-- A single query feeds the whole sidebar: conversation, date of the latest
-- message and unread count, per friend.
create or replace function public.get_friends_overview()
returns table (
  friend_id       uuid,
  conversation_id uuid,
  last_message_at timestamptz,
  unread_count    integer
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  with my_participations as (
    select cp.conversation_id, cp.last_read_at
    from public.conversation_participants cp
    where cp.user_id = auth.uid()
  ),
  pairs as (
    select mine.conversation_id, mine.last_read_at, other.user_id as friend_id
    from my_participations mine
    join public.conversation_participants other
      on other.conversation_id = mine.conversation_id
     and other.user_id <> auth.uid()
  )
  select
    p.friend_id,
    p.conversation_id,
    (
      select max(m.created_at)
      from public.messages m
      where m.conversation_id = p.conversation_id
    ) as last_message_at,
    (
      select count(*)::integer
      from public.messages m
      where m.conversation_id = p.conversation_id
        and m.sender_id <> auth.uid()
        and m.created_at > p.last_read_at
    ) as unread_count
  from pairs p;
$$;

-- Returns the subscriptions of the OTHER participants of a conversation.
-- Security definer: the caller cannot read this table directly. Membership
-- is checked first.
create or replace function public.get_push_targets(p_conversation_id uuid)
returns table (
  target_endpoint text,
  target_p256dh   text,
  target_auth     text
)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_conversation_participant(p_conversation_id, auth.uid()) then
    raise exception 'Access denied' using errcode = '42501';
  end if;

  return query
    select s.endpoint, s.p256dh, s.auth_key
    from public.push_subscriptions s
    join public.conversation_participants cp on cp.user_id = s.user_id
    where cp.conversation_id = p_conversation_id
      and s.user_id <> auth.uid();
end;
$$;

revoke all on function public.mark_conversation_read(uuid) from public, anon;
revoke all on function public.get_friends_overview()       from public, anon;
revoke all on function public.get_push_targets(uuid)       from public, anon;

grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.get_friends_overview()       to authenticated;
grant execute on function public.get_push_targets(uuid)       to authenticated;

-- =========================================================================
-- REALTIME
-- =========================================================================

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
