-- CanyonSoc — admin / RBAC / audit migration
-- Paste into Supabase Studio → SQL Editor → Run. Idempotent (safe to re-run).
-- Builds: roles, bans, audit log, server-side helper fns, ban-aware RLS, and
-- triggers that log who/what/when for every content action.
--
-- Moderation standard (matches VektorGeist): U.S. First Amendment. There is NO
-- "hate speech" / "offensive" category anywhere — the only line is actual illegal
-- content. This file enforces capability, not policy; policy lives in the app text.

begin;

-- ========== 1. roles (only elevated users get a row; no row = 'member') ==========
create table if not exists user_roles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner','admin','moderator')),
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now()
);

-- ========== 2. bans (active ban = lifted_at is null) ==========
create table if not exists user_bans (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  type       text not null check (type in ('full','soft')),
  reason     text,
  banned_by  uuid references auth.users(id) on delete set null,
  banned_at  timestamptz not null default now(),
  lifted_at  timestamptz,
  lifted_by  uuid references auth.users(id) on delete set null
);
create unique index if not exists idx_active_ban on user_bans(user_id) where lifted_at is null;

-- ========== 3. audit log (every action; ip/ua filled by the edge fn) ==========
create table if not exists audit_log (
  id            bigint generated always as identity primary key,
  ts            timestamptz not null default now(),
  actor_id      uuid,
  actor_handle  text,
  action        text not null,
  target_type   text,
  target_id     text,
  target_handle text,
  detail        jsonb,
  ip            text,
  user_agent    text
);
create index if not exists idx_audit_ts     on audit_log(ts desc);
create index if not exists idx_audit_action on audit_log(action);
create index if not exists idx_audit_actor  on audit_log(actor_id);
create index if not exists idx_audit_target on audit_log(target_type, target_id);

-- presence: when each user was last active
alter table profiles add column if not exists last_seen timestamptz;

-- ========== 4. server-side helpers (security definer: read roles past RLS) ==========
create or replace function role_of(uid uuid) returns text
  language sql stable security definer set search_path = public as $$
  select coalesce((select role from user_roles where user_id = uid), 'member');
$$;
create or replace function is_admin(uid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((select role from user_roles where user_id = uid) in ('owner','admin'), false);
$$;
create or replace function is_staff(uid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((select role from user_roles where user_id = uid) in ('owner','admin','moderator'), false);
$$;
create or replace function is_banned(uid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists(select 1 from user_bans where user_id = uid and lifted_at is null);
$$;

-- ========== 5. RLS on the new tables ==========
alter table user_roles enable row level security;
drop policy if exists roles_read on user_roles;
create policy roles_read on user_roles for select using (true);   -- public read (badges); writes are service_role only

alter table user_bans enable row level security;
drop policy if exists bans_read_staff on user_bans;
create policy bans_read_staff on user_bans for select using (is_staff(auth.uid()));  -- writes: service_role only

alter table audit_log enable row level security;
drop policy if exists audit_read_staff on audit_log;
create policy audit_read_staff on audit_log for select using (is_staff(auth.uid()));  -- writes: trigger/service_role only

-- ========== 6. ban-aware write policies (block writes from any banned user) ==========
-- posts / comments / messages have explicit insert policies:
drop policy if exists posts_insert on posts;
create policy posts_insert on posts for insert with check (auth.uid() = author_id and not is_banned(auth.uid()));
drop policy if exists comments_insert on comments;
create policy comments_insert on comments for insert with check (auth.uid() = author_id and not is_banned(auth.uid()));
drop policy if exists msg_send on messages;
create policy msg_send on messages for insert with check (auth.uid() = sender_id and not is_banned(auth.uid()));
-- "for all" tables: rebuild with a ban-aware WITH CHECK (writes blocked, own-deletes still ok):
drop policy if exists reactions_write on reactions;
create policy reactions_write on reactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id and not is_banned(auth.uid()));
drop policy if exists listings_write on listings;
create policy listings_write on listings for all using (auth.uid() = user_id) with check (auth.uid() = user_id and not is_banned(auth.uid()));
drop policy if exists rides_write on rides;
create policy rides_write on rides for all using (auth.uid() = user_id) with check (auth.uid() = user_id and not is_banned(auth.uid()));
drop policy if exists photos_write on photos;
create policy photos_write on photos for all using (auth.uid() = user_id) with check (auth.uid() = user_id and not is_banned(auth.uid()));
drop policy if exists park_write on park_experience;
create policy park_write on park_experience for all using (auth.uid() = user_id) with check (auth.uid() = user_id and not is_banned(auth.uid()));
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id and not is_banned(auth.uid()));

-- ========== 7. audit triggers — log every USER content action (who/what/when) ==========
-- Service-role/admin actions (auth.uid() is null here) are skipped: the edge fn logs
-- those explicitly with IP+device. Large blob columns are stripped from detail.
create or replace function audit_content() returns trigger
  language plpgsql security definer set search_path = public as $$
declare a uuid; h text; tid text; d jsonb;
begin
  a := auth.uid();
  if a is null then  -- service_role / migration: edge fn logs these richly
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select handle into h from profiles where user_id = a;
  d := (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)
        - 'image_url' - 'cover_url' - 'pic_url' - 'url' - 'src';
  -- target id: most tables key on `id`, but `profiles` keys on `user_id`.
  -- Pull from the jsonb so an id-less table never throws "record has no field id".
  insert into audit_log(actor_id, actor_handle, action, target_type, target_id, detail)
  values (a, h, lower(tg_op) || '_' || tg_table_name, tg_table_name,
          coalesce(d->>'id', d->>'user_id'), d);
  return case when tg_op = 'DELETE' then old else new end;
end; $$;

do $$ declare t text;
begin
  foreach t in array array['posts','comments','listings','rides','messages','photos','reactions','park_experience','profiles']
  loop
    execute format('drop trigger if exists audit_%1$s on %1$s', t);
    execute format('create trigger audit_%1$s after insert or update or delete on %1$s for each row execute function audit_content()', t);
  end loop;
end $$;

-- ========== 8. invite flow: invited_role in user metadata -> role on signup ==========
create or replace function apply_invited_role() returns trigger
  language plpgsql security definer set search_path = public as $$
declare r text;
begin
  r := new.raw_user_meta_data ->> 'invited_role';
  if r in ('admin','moderator') then
    insert into user_roles(user_id, role) values (new.id, r)
      on conflict (user_id) do nothing;
  end if;
  return new;
end; $$;
drop trigger if exists apply_invited_role on auth.users;
create trigger apply_invited_role after insert on auth.users for each row execute function apply_invited_role();

-- ========== 9. seed the owner (Lee / Holohydra) ==========
insert into user_roles(user_id, role)
select user_id, 'owner' from profiles where handle = 'holohydra'
on conflict (user_id) do update set role = 'owner';

commit;

-- Verify:
--   select p.handle, r.role from user_roles r join profiles p using(user_id);
--   -> holohydra | owner
