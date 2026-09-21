-- =========================================================================
-- Migration 0002 — Unread messages and push notifications
-- =========================================================================
-- Non-destructive. Run it after 0001.
--
-- Adds:
--   • conversation_participants.last_read_at + read/mark RPCs
--   • the push_subscriptions table + the recipient targeting RPC
--
-- Online presence needs no table: it goes through the Supabase Realtime
-- Presence channel, which lives in memory.
-- =========================================================================

begin;

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

-- -------------------------------------------------------------------------
-- 1. Read tracking
-- -------------------------------------------------------------------------

alter table public.conversation_participants
  add column if not exists last_read_at timestamptz not null default now();

-- Deliberately NO UPDATE policy on conversation_participants: a
-- `with check (user_id = auth.uid())` would let a user move their own row to
-- another conversation, and so invite themselves into it. Marking as read
-- goes through the function below, which only touches `last_read_at`.
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

-- -------------------------------------------------------------------------
-- 2. Push subscriptions
-- -------------------------------------------------------------------------

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth_key   text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_own" on public.push_subscriptions;
create policy "push_subscriptions_own" on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

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

commit;
