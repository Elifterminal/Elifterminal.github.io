-- ============================================================================
-- CanyonSoc — RUN THIS ONE FILE in Supabase Studio → SQL Editor → Run.
-- Idempotent (safe to run more than once). It does four things:
--   1. FIX a real bug: profile create/edit was failing for new users
--      ("record has no field id") because the audit trigger assumed every
--      table has an `id` column, but `profiles` is keyed on `user_id`.
--   2. start_dm() — lets two people open a 1:1 DM thread (Phase 4).
--   3. listings.price column (Phase 5 marketplace).
--   4. posts_update policy — lets people edit their own posts (Phase 6).
-- A verification query at the very bottom prints what landed.
-- ============================================================================

begin;

-- 1) Audit trigger fix — pull the target id from JSON so an id-less table
--    (profiles → user_id) never throws. Same logic for every other table.
create or replace function audit_content() returns trigger
  language plpgsql security definer set search_path = public as $$
declare a uuid; h text; d jsonb;
begin
  a := auth.uid();
  if a is null then  -- service_role / migration: edge fn logs these richly
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select handle into h from profiles where user_id = a;
  d := (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)
        - 'image_url' - 'cover_url' - 'pic_url' - 'url' - 'src';
  insert into audit_log(actor_id, actor_handle, action, target_type, target_id, detail)
  values (a, h, lower(tg_op) || '_' || tg_table_name, tg_table_name,
          coalesce(d->>'id', d->>'user_id'), d);
  return case when tg_op = 'DELETE' then old else new end;
end; $$;

-- 2) 1:1 DM bootstrap. SECURITY DEFINER so it can add the OTHER participant
--    past the self-only thread_participants RLS. Caller is always auth.uid().
create or replace function start_dm(other uuid) returns bigint
  language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); tid bigint;
begin
  if me is null or other is null or me = other then
    raise exception 'bad participants';
  end if;
  select tp.thread_id into tid
  from thread_participants tp
  join thread_participants o on o.thread_id = tp.thread_id
  where tp.user_id = me and o.user_id = other
    and (select count(*) from thread_participants x where x.thread_id = tp.thread_id) = 2
  limit 1;
  if tid is not null then return tid; end if;
  insert into threads default values returning id into tid;
  insert into thread_participants(thread_id, user_id) values (tid, me), (tid, other);
  return tid;
end; $$;
grant execute on function start_dm(uuid) to authenticated;
revoke execute on function start_dm(uuid) from anon;

-- 3) Marketplace price.
alter table listings add column if not exists price text;

-- 4) Edit your own posts (delete already allowed by posts_delete).
drop policy if exists posts_update on posts;
create policy posts_update on posts for update
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id and not public.is_banned(auth.uid()));

commit;

-- Nudge PostgREST to pick up the new column/function immediately.
notify pgrst, 'reload schema';

-- ============================================================================
-- VERIFY — this should return one row reading:  start_dm=t | price=t | posts_update=t
select
  exists(select 1 from pg_proc where proname='start_dm')                          as start_dm,
  exists(select 1 from information_schema.columns
         where table_name='listings' and column_name='price')                     as price,
  exists(select 1 from pg_policies where tablename='posts' and policyname='posts_update') as posts_update;
