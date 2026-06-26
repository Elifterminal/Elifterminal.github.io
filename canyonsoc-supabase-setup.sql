-- CanyonSoc — Supabase setup (paste into Supabase Studio → SQL Editor → Run)
-- Supabase-specific: profiles + all FKs reference auth.users(id).
-- Enables Row-Level Security with public-read / own-write policies.
-- After running, create a public Storage bucket named "media" (Storage → New bucket).

begin;

-- ---------- profiles + park experience ----------
create table if not exists profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  handle     text unique not null check (handle ~ '^[a-z0-9_]{2,30}$'),
  name       text not null,
  company    text, job text, housing text, status text, bio text,
  pic_url    text, cover_url text,
  updated_at timestamptz not null default now()
);
create table if not exists park_experience (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  park text not null, role text, years text, review text,
  created_at timestamptz not null default now()
);

-- ---------- social graph ----------
create table if not exists friendships (
  id bigint generated always as identity primary key,
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','blocked')),
  created_at timestamptz not null default now(),
  unique (requester_id, addressee_id), check (requester_id <> addressee_id)
);

-- ---------- feed ----------
create table if not exists posts (
  id bigint generated always as identity primary key,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text, image_url text, created_at timestamptz not null default now()
);
create table if not exists comments (
  id bigint generated always as identity primary key,
  post_id bigint not null references posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null, created_at timestamptz not null default now()
);
create table if not exists reactions (
  id bigint generated always as identity primary key,
  target_type text not null check (target_type in ('post','comment','photo')),
  target_id bigint not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null, created_at timestamptz not null default now(),
  unique (target_type, target_id, user_id, emoji)
);
create table if not exists photos (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null, caption text, created_at timestamptz not null default now()
);

-- ---------- marketplace + rides ----------
create table if not exists listings (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null, detail text,
  type text not null check (type in ('For sale','ISO','Events','Announcements','Free','Yard sale')),
  tags text[] not null default '{}', created_at timestamptz not null default now()
);
create index if not exists idx_listings_tags on listings using gin(tags);
create table if not exists rides (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  destination text not null, when_text text not null, seats_note text,
  created_at timestamptz not null default now()
);

-- ---------- messaging ----------
create table if not exists threads (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);
create table if not exists thread_participants (
  thread_id bigint not null references threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (thread_id, user_id)
);
create table if not exists messages (
  id bigint generated always as identity primary key,
  thread_id bigint not null references threads(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text, image_url text,
  created_at timestamptz not null default now(), read_at timestamptz
);
create index if not exists idx_messages_thread on messages(thread_id, created_at);

-- ---------- notifications ----------
create table if not exists notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('react','comment','mention','friend','message','market')),
  text text not null, ref text,
  read boolean not null default false, created_at timestamptz not null default now()
);
create index if not exists idx_notif_user on notifications(user_id, read, created_at desc);

commit;

-- ============================================================
-- Row-Level Security: public-read where it makes sense, own-write everywhere.
-- ============================================================
alter table profiles enable row level security;
create policy "profiles_read"   on profiles for select using (true);
create policy "profiles_insert" on profiles for insert with check (auth.uid() = user_id);
create policy "profiles_update" on profiles for update using (auth.uid() = user_id);

alter table park_experience enable row level security;
create policy "park_read"   on park_experience for select using (true);
create policy "park_write"  on park_experience for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table friendships enable row level security;
create policy "friend_read"  on friendships for select using (auth.uid() in (requester_id, addressee_id));
create policy "friend_write" on friendships for all using (auth.uid() in (requester_id, addressee_id)) with check (auth.uid() = requester_id or auth.uid() = addressee_id);

alter table posts enable row level security;
create policy "posts_read"   on posts for select using (true);
create policy "posts_insert" on posts for insert with check (auth.uid() = author_id);
create policy "posts_delete" on posts for delete using (auth.uid() = author_id);

alter table comments enable row level security;
create policy "comments_read"   on comments for select using (true);
create policy "comments_insert" on comments for insert with check (auth.uid() = author_id);
create policy "comments_delete" on comments for delete using (auth.uid() = author_id);

alter table reactions enable row level security;
create policy "reactions_read"  on reactions for select using (true);
create policy "reactions_write" on reactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table photos enable row level security;
create policy "photos_read"  on photos for select using (true);
create policy "photos_write" on photos for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table listings enable row level security;
create policy "listings_read"  on listings for select using (true);
create policy "listings_write" on listings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table rides enable row level security;
create policy "rides_read"  on rides for select using (true);
create policy "rides_write" on rides for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table threads enable row level security;
alter table thread_participants enable row level security;
alter table messages enable row level security;
create policy "tp_read"  on thread_participants for select using (auth.uid() = user_id);
create policy "tp_write" on thread_participants for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "thread_read" on threads for select using (
  exists (select 1 from thread_participants tp where tp.thread_id = threads.id and tp.user_id = auth.uid()));
create policy "msg_read" on messages for select using (
  exists (select 1 from thread_participants tp where tp.thread_id = messages.thread_id and tp.user_id = auth.uid()));
create policy "msg_send" on messages for insert with check (auth.uid() = sender_id);

alter table notifications enable row level security;
create policy "notif_read"  on notifications for select using (auth.uid() = user_id);
create policy "notif_update" on notifications for update using (auth.uid() = user_id);

-- Storage: after creating a public "media" bucket, allow authenticated uploads.
-- create policy "media_read"   on storage.objects for select using (bucket_id = 'media');
-- create policy "media_upload" on storage.objects for insert to authenticated with check (bucket_id = 'media');
