-- CanyonSoc — social layer enablement (storage + notifications + realtime)
-- Paste into Supabase Studio → SQL Editor → Run. Idempotent. Depends on
-- canyonsoc-admin.sql (uses is_banned / is_staff). This is the LAST manual SQL —
-- after it, the front-end migration needs nothing else from you.

begin;

-- ========== 1. Storage: media bucket — public read, per-user upload folders ==========
insert into storage.buckets (id, name, public) values ('media', 'media', true)
  on conflict (id) do update set public = true;

drop policy if exists media_read on storage.objects;
create policy media_read on storage.objects for select
  using (bucket_id = 'media');

-- uploads must land in a folder named after the uploader's id (no overwriting others),
-- and banned users can't upload:
drop policy if exists media_insert on storage.objects;
create policy media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not public.is_banned(auth.uid())
  );

drop policy if exists media_update on storage.objects;
create policy media_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and owner = auth.uid());

-- owners delete their own; staff can delete anything (moderation):
drop policy if exists media_delete on storage.objects;
create policy media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (owner = auth.uid() or public.is_staff(auth.uid())));

-- ========== 2. Server-side notifications (clients can't forge them) ==========
-- notifications has no client INSERT policy; this SECURITY DEFINER fn is the only writer.
create or replace function notify(_user uuid, _actor uuid, _kind text, _text text, _ref text)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if _user is null or _user = _actor then return; end if;  -- never notify yourself
  insert into notifications(user_id, actor_id, kind, text, ref) values (_user, _actor, _kind, _text, _ref);
end; $$;

create or replace function notif_on_comment() returns trigger
  language plpgsql security definer set search_path = public as $$
declare owner uuid; h text;
begin
  select author_id into owner from posts where id = new.post_id;
  select handle into h from profiles where user_id = new.author_id;
  perform notify(owner, new.author_id, 'comment', '@' || coalesce(h,'someone') || ' commented on your post', 'home');
  return new;
end; $$;
drop trigger if exists notif_comment on comments;
create trigger notif_comment after insert on comments for each row execute function notif_on_comment();

create or replace function notif_on_reaction() returns trigger
  language plpgsql security definer set search_path = public as $$
declare owner uuid; h text;
begin
  if new.target_type = 'post' then
    select author_id into owner from posts where id = new.target_id;
    select handle into h from profiles where user_id = new.user_id;
    perform notify(owner, new.user_id, 'react', '@' || coalesce(h,'someone') || ' reacted ' || new.emoji || ' to your post', 'home');
  end if;
  return new;
end; $$;
drop trigger if exists notif_reaction on reactions;
create trigger notif_reaction after insert on reactions for each row execute function notif_on_reaction();

create or replace function notif_on_friend() returns trigger
  language plpgsql security definer set search_path = public as $$
declare h text;
begin
  select handle into h from profiles where user_id = new.requester_id;
  if new.status = 'pending' then
    perform notify(new.addressee_id, new.requester_id, 'friend', '@' || coalesce(h,'someone') || ' sent you a friend request', 'profile');
  elsif new.status = 'accepted' then
    perform notify(new.requester_id, new.addressee_id, 'friend', '@' || coalesce(h,'someone') || ' accepted your friend request', 'profile');
  end if;
  return new;
end; $$;
drop trigger if exists notif_friend_ins on friendships;
create trigger notif_friend_ins after insert on friendships for each row execute function notif_on_friend();
drop trigger if exists notif_friend_upd on friendships;
create trigger notif_friend_upd after update on friendships for each row
  when (old.status is distinct from new.status) execute function notif_on_friend();

create or replace function notif_on_message() returns trigger
  language plpgsql security definer set search_path = public as $$
declare h text; rec record;
begin
  select handle into h from profiles where user_id = new.sender_id;
  for rec in select user_id from thread_participants where thread_id = new.thread_id and user_id <> new.sender_id loop
    perform notify(rec.user_id, new.sender_id, 'message', '@' || coalesce(h,'someone') || ' sent you a message', 'messages');
  end loop;
  return new;
end; $$;
drop trigger if exists notif_message on messages;
create trigger notif_message after insert on messages for each row execute function notif_on_message();

-- let users clear their own notifications
drop policy if exists notif_delete on notifications;
create policy notif_delete on notifications for delete using (auth.uid() = user_id);

commit;

-- ========== 3. Realtime: push new messages + notifications without refresh ==========
-- (separate from the txn; ignore "already member" notices on re-run)
do $$ begin
  alter publication supabase_realtime add table messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table notifications;
exception when duplicate_object then null; end $$;
