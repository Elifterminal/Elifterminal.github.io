-- CanyonSoc — backend schema (PostgreSQL, hosting-agnostic)
-- Works on Supabase or a self-hosted Postgres. Mirrors the current
-- localStorage shapes in canyonsoc.html so the front-end maps cleanly.
--
-- Notes:
--  * On Supabase, `users` is provided by auth.users; create `profiles`
--    with user_id REFERENCES auth.users(id) and skip the `users` table.
--  * Row-Level Security (RLS) policies are sketched at the bottom.
--  * Photos/cover/post images live in object storage (Supabase Storage,
--    S3, or R2) — tables store the URL, never base64.

begin;

-- ---------- identity ----------
create table if not exists users (
  id           uuid primary key default gen_random_uuid(),
  email        text unique not null,
  created_at   timestamptz not null default now()
);

create table if not exists profiles (
  user_id      uuid primary key references users(id) on delete cascade,
  handle       text unique not null check (handle ~ '^[a-z0-9_]{2,30}$'),
  name         text not null,
  company      text,
  job          text,
  housing      text,                 -- nullable: optional + "prefer not to say"
  status       text,
  bio          text,
  pic_url      text,
  cover_url    text,
  updated_at   timestamptz not null default now()
);

create table if not exists park_experience (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references users(id) on delete cascade,
  park         text not null,
  role         text,
  years        text,
  review       text,
  created_at   timestamptz not null default now()
);

-- ---------- social graph ----------
-- one row per directed request; accepted = mutual friendship
create table if not exists friendships (
  id           bigint generated always as identity primary key,
  requester_id uuid not null references users(id) on delete cascade,
  addressee_id uuid not null references users(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','accepted','blocked')),
  created_at   timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
create index if not exists idx_friend_addressee on friendships(addressee_id, status);

-- ---------- feed ----------
create table if not exists posts (
  id           bigint generated always as identity primary key,
  author_id    uuid not null references users(id) on delete cascade,
  body         text,
  image_url    text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_posts_author_time on posts(author_id, created_at desc);

create table if not exists comments (
  id           bigint generated always as identity primary key,
  post_id      bigint not null references posts(id) on delete cascade,
  author_id    uuid not null references users(id) on delete cascade,
  body         text not null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_comments_post on comments(post_id, created_at);

-- reactions on posts / comments / photos (polymorphic by target_type)
create table if not exists reactions (
  id           bigint generated always as identity primary key,
  target_type  text not null check (target_type in ('post','comment','photo')),
  target_id    bigint not null,
  user_id      uuid not null references users(id) on delete cascade,
  emoji        text not null,
  created_at   timestamptz not null default now(),
  unique (target_type, target_id, user_id, emoji)
);
create index if not exists idx_reactions_target on reactions(target_type, target_id);

create table if not exists photos (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references users(id) on delete cascade,
  url          text not null,
  caption      text,
  created_at   timestamptz not null default now()
);

-- ---------- marketplace + rides ----------
create table if not exists listings (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references users(id) on delete cascade,
  title        text not null,
  detail       text,                 -- price or descriptor ("$40", "Free", "Sat 8am")
  type         text not null check (type in ('For sale','ISO','Events','Announcements','Free','Yard sale')),
  tags         text[] not null default '{}',
  created_at   timestamptz not null default now()
);
create index if not exists idx_listings_type on listings(type, created_at desc);
create index if not exists idx_listings_tags on listings using gin(tags);

create table if not exists rides (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references users(id) on delete cascade,
  destination  text not null,
  when_text    text not null,
  seats_note   text,
  created_at   timestamptz not null default now()
);

-- ---------- messaging ----------
create table if not exists threads (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now()
);
create table if not exists thread_participants (
  thread_id    bigint not null references threads(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  primary key (thread_id, user_id)
);
create table if not exists messages (
  id           bigint generated always as identity primary key,
  thread_id    bigint not null references threads(id) on delete cascade,
  sender_id    uuid not null references users(id) on delete cascade,
  body         text,
  image_url    text,
  created_at   timestamptz not null default now(),
  read_at      timestamptz
);
create index if not exists idx_messages_thread on messages(thread_id, created_at);

-- ---------- notifications ----------
create table if not exists notifications (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references users(id) on delete cascade,   -- recipient
  actor_id     uuid references users(id) on delete set null,           -- who did it
  kind         text not null check (kind in ('react','comment','mention','friend','message','market')),
  text         text not null,
  ref          text,                 -- view to open: home/profile/marketplace/transit/messages
  read         boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists idx_notif_user on notifications(user_id, read, created_at desc);

commit;

-- ============================================================
-- Row-Level Security sketch (enable on Supabase). Illustrative.
-- ============================================================
-- alter table profiles enable row level security;
-- create policy "profiles are public to read"  on profiles for select using (true);
-- create policy "edit own profile"             on profiles for update using (auth.uid() = user_id);
--
-- alter table posts enable row level security;
-- create policy "posts readable by all"        on posts for select using (true);
-- create policy "insert own posts"             on posts for insert with check (auth.uid() = author_id);
-- create policy "delete own posts"             on posts for delete using (auth.uid() = author_id);
--
-- alter table messages enable row level security;
-- create policy "read messages in my threads"  on messages for select
--   using (exists (select 1 from thread_participants tp
--                  where tp.thread_id = messages.thread_id and tp.user_id = auth.uid()));
-- create policy "send as myself"               on messages for insert with check (auth.uid() = sender_id);
--
-- alter table notifications enable row level security;
-- create policy "read my notifications"        on notifications for select using (auth.uid() = user_id);
