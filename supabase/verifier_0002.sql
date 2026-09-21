-- =========================================================================
-- Migration 0002 check
-- =========================================================================
-- The Supabase SQL Editor only shows the result of the LAST statement in a
-- script, so this file holds a single query. It always returns 5 rows: look
-- at the "status" column.
--
-- Only useful for debugging: you can delete this file once 0002 is applied.
-- =========================================================================

with expected (kind, name) as (
  values
    ('function', 'get_friends_overview'),
    ('function', 'mark_conversation_read'),
    ('function', 'get_push_targets'),
    ('column',   'conversation_participants.last_read_at'),
    ('table',    'push_subscriptions')
)
select
  e.kind,
  e.name,
  case e.kind
    when 'function' then
      case
        when not exists (
          select 1 from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = e.name
        ) then 'MISSING — migration 0002 not applied'
        when not exists (
          select 1 from information_schema.routine_privileges
          where specific_schema = 'public'
            and routine_name = e.name
            and grantee = 'authenticated'
            and privilege_type = 'EXECUTE'
        ) then 'EXISTS but NO EXECUTE right for authenticated'
        else 'OK'
      end
    when 'column' then
      case when exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'conversation_participants'
          and column_name = 'last_read_at'
      ) then 'OK' else 'MISSING' end
    else
      case when exists (
        select 1 from information_schema.tables
        where table_schema = 'public' and table_name = 'push_subscriptions'
      ) then 'OK' else 'MISSING' end
  end as status
from expected e;

-- =========================================================================
-- What to do
-- =========================================================================
-- Everything "MISSING"   → migration 0002 was not applied. Run
--                          supabase/migrations/0002_unread_presence_push.sql
--                          again and make sure no error shows up.
--
-- "NO EXECUTE right"     → run only the `grant execute` block at the end of
--                          the migration.
--
-- Everything "OK" but    → PostgREST's schema cache is stale. Run ONLY the
--   the app gets 404s      line below, then reload the app:
--
--   notify pgrst, 'reload schema';
--
--   If the 404 persists after that, Dashboard → Settings → General →
--   "Restart project" rebuilds the cache.
-- =========================================================================
