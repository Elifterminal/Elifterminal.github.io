-- CanyonSoc — DM bootstrap helper (Phase 4)
-- Paste into Supabase Studio → SQL Editor → Run. Idempotent.
--
-- Why this exists: thread_participants RLS (tp_write) only lets a user insert a
-- row for THEMSELVES. That's correct for security, but it means a browser can't
-- add the OTHER person when opening a brand-new 1:1 thread. This SECURITY DEFINER
-- function does that one privileged step server-side: it finds an existing 1:1
-- thread between the caller and `other`, or creates one with both participants,
-- and returns the thread id. It always pins the caller to auth.uid() so nobody
-- can forge a conversation on someone else's behalf.

create or replace function start_dm(other uuid) returns bigint
  language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); tid bigint;
begin
  if me is null or other is null or me = other then
    raise exception 'bad participants';
  end if;
  -- reuse an existing 1:1 thread that has exactly these two members
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

-- Phase 5: marketplace listings carry a price string the UI already collects.
alter table listings add column if not exists price text;
