# CanyonSoc — backend scoping

The front-end is a working demo, but every social feature is per-device localStorage with
simulated activity. Friends, messages, listings, and posts don't sync between real people.
This doc scopes the backend that makes them real, and flags the one decision that's yours.

## What "real" requires

1. **Accounts** — a person signs in and is the same person on their phone and laptop.
2. **Shared data** — posts, profiles, friends, listings, rides live server-side, not in a browser.
3. **Real-time** — messages and notifications arrive without a refresh.
4. **File storage** — profile pics, cover photos, post and message images move out of localStorage
   (which has a ~5 MB ceiling and is per-device) into object storage that serves real URLs.

## Data model

See `canyonsoc-schema.sql` — portable Postgres DDL that mirrors the current localStorage shapes,
so the front-end maps over cleanly. Tables: `profiles`, `park_experience`, `friendships`, `posts`,
`comments`, `reactions`, `photos`, `listings`, `rides`, `threads` / `thread_participants` /
`messages`, and `notifications`. Reactions are polymorphic (post/comment/photo). Listing tags use a
`text[]` with a GIN index so the tag filter and search stay fast.

## API surface

REST, returning the standard envelope (`{ success, data, error, pagination }`), with data access
behind a repository interface (`findAll/findById/create/update/delete`) per house style:

- `auth`        — sign-in / sign-out / session, claim a unique handle on first run
- `profiles`    — get by handle, update own, list (for search + "people you may know")
- `posts`       — list feed (all / friends), create, delete; nested `comments`, `reactions`
- `friendships` — request / accept / remove; "friends" feed filter reads accepted edges
- `listings`    — list (type + tags + text search), create, delete
- `rides`       — list, create
- `messages`    — list threads, open/create thread, send (text or image), mark read
- `notifications` — list (with per-kind filter), mark read / mark-all-read
- `photos`      — list own, upload (returns a storage URL)

Real-time for `messages` and `notifications` via WebSocket/SSE (or Supabase Realtime channels).
Everything else can be plain request/response with optimistic UI, which the front-end already does.

## Auth

Email magic-link is the least-friction fit for a worker community (no passwords to manage). Google
OAuth is a fine add. On first sign-in the user claims a unique `@handle` and fills the profile —
the form already exists. Handle uniqueness is enforced at the DB (`profiles.handle unique`).

## Hosting — the decision that's yours

| | **Supabase (recommended)** | **Self-host on the Oracle VM** | **Other (Firebase / PocketBase)** |
|---|---|---|---|
| DB | Managed Postgres | Existing Postgres on the box | Varies |
| Auth | Built in (magic link, OAuth) | Build it (Lucia/Auth.js + sessions) | Built in |
| Real-time | Built in | Add ws/SSE yourself | Built in |
| File storage | Built in | Add (disk + Caddy, or R2) | Built in |
| Front-end | Stays on GitHub Pages | Stays on Pages | Stays on Pages |
| Ops burden | Low | Higher (you run it) | Low–medium |
| Cost | Free tier covers this easily | Already paid (Oracle) | Free tier |
| Security note | anon key is public **by design**; RLS is the boundary | **shares the box Vanta now has access to** | external vendor |

**Recommendation: Supabase.** It gives Postgres + auth + real-time + storage in one place, the
free tier comfortably covers a canyon-sized community, and the front-end keeps living on GitHub
Pages — it just points at the Supabase URL. The public anon key is safe to ship (that's the model);
security lives in Row-Level Security policies, sketched at the bottom of the schema file.

The Oracle VM is viable since it already runs Postgres, but it now **shares a host that Vanta has
SSH + scoped sudo on**, so putting a second public app and a new user table there mixes trust
boundaries I'd rather keep separate. If you want everything under your own roof, it's doable — it's
just more to build and run.

## Phased rollout (incremental, low-risk)

The front-end keeps its localStorage path until each slice is wired, so nothing breaks mid-migration:

1. **Auth + profiles** — sign in, claim handle, profiles sync. Search + suggestions read real users.
2. **Posts + comments + reactions** — the feed becomes shared; reactions/comments persist for real.
3. **Friends** — real friend edges; the All/Friends filter reads them.
4. **Messages** — real-time DMs across devices (replaces simulated threads).
5. **Marketplace + rides** — shared listings with server-side tag/type/text filtering.
6. **Notifications + storage** — real notifications from real actions; images move to object storage.

## Security (house rules apply)

- No secrets in the client beyond the public anon key. RLS is the real boundary.
- Validate every input at the API edge; parameterized queries only.
- Auth required on all mutations; users can only edit their own rows.
- Rate-limit writes; basic abuse controls on posts/messages.
- Photos: validate mime + size on upload; downscale already happens client-side.

## What I need from you

One call: **hosting** (Supabase vs Oracle VM vs other). Pick that and I'll start Phase 1 — wiring
auth + profiles behind the repository interface — and we keep the same iterate-and-push rhythm.
