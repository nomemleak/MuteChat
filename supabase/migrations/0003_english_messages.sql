-- =========================================================================
-- Migration 0003 — English error messages
-- =========================================================================
-- Non-destructive. Run it after 0002.
--
-- Redefines the four RPCs that raise errors so their messages are in
-- English. Their logic, signatures and permissions are unchanged: this is a
-- plain `create or replace`, so existing grants are kept.
-- =========================================================================

begin;

-- Returns the one-to-one conversation with a friend, or creates it.
-- An advisory lock on the pair prevents two duplicate conversations when the
-- user opens two tabs.
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

-- Sends a friend request from a username, handling both directions of the
-- relationship and the business errors in a single transaction.
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

commit;
