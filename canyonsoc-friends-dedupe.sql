-- CanyonSoc — prevent duplicate friendship rows at the source
-- Run ONCE in the Supabase SQL editor (Project → SQL Editor → paste → Run).
--
-- Problem: the table's `unique (requester_id, addressee_id)` only blocks a second
-- row in the SAME direction. A pair could still have BOTH A→B and B→A rows, which
-- listed (and counted) each friend twice. This cleans existing duplicates and adds
-- a unique index on the UNORDERED pair so it can never happen again.

-- 1) If any row in a pair is 'accepted', mark the whole pair accepted (so dedupe keeps the right status).
update friendships f
set status = 'accepted'
from (
  select least(requester_id, addressee_id)  as lo,
         greatest(requester_id, addressee_id) as hi
  from friendships
  where status = 'accepted'
) acc
where least(f.requester_id, f.addressee_id)  = acc.lo
  and greatest(f.requester_id, f.addressee_id) = acc.hi
  and f.status <> 'accepted';

-- 2) Delete duplicate rows, keeping ONE per unordered pair (prefer accepted, then the oldest).
delete from friendships f
using (
  select id,
         row_number() over (
           partition by least(requester_id, addressee_id), greatest(requester_id, addressee_id)
           order by (status = 'accepted') desc, created_at asc
         ) as rn
  from friendships
) d
where f.id = d.id
  and d.rn > 1;

-- 3) Hard guarantee: at most one row per unordered pair, regardless of direction.
create unique index if not exists friendships_pair_uniq
  on friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

-- After this runs, the app's "Add friend" flow will accept an existing incoming
-- request instead of creating a mirror row, and the index backstops any race.
