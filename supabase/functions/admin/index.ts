// CanyonSoc — admin edge function.
// The ONLY thing in the system that wields service_role. It authenticates the
// caller's JWT, re-checks their role server-side (never trusts the browser), runs
// the privileged action, and writes an audit_log row with IP + device.
//
// Deploy: Supabase dashboard → Edge Functions → Via Editor → name "admin" →
// paste this → leave Verify JWT ON → Deploy. No secret to set: SUPABASE_URL,
// SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// Roles: owner > admin > moderator > member. Owner is fixed (you). Mods moderate
// content + DMs; admins also manage users/roles/invites; only the owner touches admins.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

const BLOB = ["image_url", "pic_url", "cover_url", "url", "src"];
const strip = (row: Record<string, unknown> | null) =>
  row ? Object.fromEntries(Object.entries(row).filter(([k]) => !BLOB.includes(k))) : null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "unauthenticated" }, 401);

  const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const role = (await svc.from("user_roles").select("role").eq("user_id", user.id).maybeSingle()).data?.role || "member";
  const isStaff = ["owner", "admin", "moderator"].includes(role);
  const isAdmin = ["owner", "admin"].includes(role);
  if (!isStaff) return json({ error: "forbidden" }, 403);

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const ua = req.headers.get("user-agent") || "";
  const actorHandle = (await svc.from("profiles").select("handle").eq("user_id", user.id).maybeSingle()).data?.handle || null;
  const body = await req.json().catch(() => ({} as Record<string, any>));
  const a = body.action;
  const log = (action: string, tt: string | null, tid: any, th: string | null, detail: unknown) =>
    svc.from("audit_log").insert({
      actor_id: user.id, actor_handle: actorHandle, action,
      target_type: tt, target_id: tid == null ? null : String(tid), target_handle: th,
      detail: detail ?? null, ip, user_agent: ua,
    });

  const roleOf = async (id: string) =>
    (await svc.from("user_roles").select("role").eq("user_id", id).maybeSingle()).data?.role || "member";

  try {
    switch (a) {
      case "list_users": {
        const { data: ps } = await svc.from("profiles")
          .select("user_id,handle,name,company,job,status,housing,last_seen,updated_at");
        const { data: rs } = await svc.from("user_roles").select("user_id,role");
        const { data: bs } = await svc.from("user_bans").select("user_id,type,reason,banned_at").is("lifted_at", null);
        const rmap: Record<string, string> = Object.fromEntries((rs || []).map((r) => [r.user_id, r.role]));
        const bmap: Record<string, any> = Object.fromEntries((bs || []).map((b) => [b.user_id, b]));
        const users = (ps || []).map((u) => ({ ...u, role: rmap[u.user_id] || "member", ban: bmap[u.user_id] || null }));
        return json({ ok: true, users });
      }
      case "set_role": {
        if (!isAdmin) return json({ error: "forbidden" }, 403);
        const tgt = body.target, nr = body.role;
        const tr = await roleOf(tgt);
        if (tr === "owner" || nr === "owner") return json({ error: "owner is fixed" }, 403);
        if ((nr === "admin" || tr === "admin") && role !== "owner") return json({ error: "only owner manages admins" }, 403);
        if (nr === "member") await svc.from("user_roles").delete().eq("user_id", tgt);
        else await svc.from("user_roles").upsert({ user_id: tgt, role: nr, granted_by: user.id, granted_at: new Date().toISOString() });
        await log("set_role", "user", tgt, body.target_handle, { role: nr });
        return json({ ok: true });
      }
      case "ban": {
        const tgt = body.target, type = body.type === "full" ? "full" : "soft";
        const tr = await roleOf(tgt);
        if (tr === "owner") return json({ error: "cannot ban owner" }, 403);
        if (["admin", "moderator"].includes(tr) && !isAdmin) return json({ error: "mods cannot ban staff" }, 403);
        await svc.from("user_bans").insert({ user_id: tgt, type, reason: body.reason || null, banned_by: user.id });
        if (type === "full") await svc.auth.admin.updateUserById(tgt, { ban_duration: "876000h" });
        await log("ban", "user", tgt, body.target_handle, { type, reason: body.reason || null });
        return json({ ok: true });
      }
      case "unban": {
        const tgt = body.target;
        await svc.from("user_bans").update({ lifted_at: new Date().toISOString(), lifted_by: user.id })
          .eq("user_id", tgt).is("lifted_at", null);
        await svc.auth.admin.updateUserById(tgt, { ban_duration: "none" });
        await log("unban", "user", tgt, body.target_handle, null);
        return json({ ok: true });
      }
      case "delete_user": {
        if (!isAdmin) return json({ error: "forbidden" }, 403);
        const tgt = body.target, tr = await roleOf(tgt);
        if (tr === "owner") return json({ error: "cannot delete owner" }, 403);
        if (tr === "admin" && role !== "owner") return json({ error: "only owner deletes admins" }, 403);
        await svc.auth.admin.deleteUser(tgt);
        await log("delete_user", "user", tgt, body.target_handle, null);
        return json({ ok: true });
      }
      case "invite": {
        if (!isAdmin) return json({ error: "forbidden" }, 403);
        const email = body.email, ir = body.role;
        if (ir === "admin" && role !== "owner") return json({ error: "only owner invites admins" }, 403);
        const meta = (ir === "moderator" || ir === "admin") ? { invited_role: ir } : {};
        const { error } = await svc.auth.admin.inviteUserByEmail(email, { data: meta });
        if (error) return json({ error: error.message }, 400);
        await log("invite", "user", null, email, { role: ir });
        return json({ ok: true });
      }
      case "delete_content": {
        const tt = body.ttype, id = body.id;
        if (!["posts", "comments", "listings", "rides", "photos", "messages"].includes(tt))
          return json({ error: "bad type" }, 400);
        const { data: row } = await svc.from(tt).select("*").eq("id", id).maybeSingle();
        await svc.from(tt).delete().eq("id", id);
        await log("moderate_delete", tt, id, null, strip(row as any));
        return json({ ok: true });
      }
      case "list_threads": {
        const { data } = await svc.from("threads").select("id,created_at").order("created_at", { ascending: false });
        return json({ ok: true, threads: data || [] });
      }
      case "read_thread": {
        const tid = body.thread_id;
        const { data: msgs } = await svc.from("messages").select("*").eq("thread_id", tid).order("created_at");
        const { data: parts } = await svc.from("thread_participants").select("user_id").eq("thread_id", tid);
        await log("read_dm", "thread", tid, null, { participants: (parts || []).map((p) => p.user_id) });
        return json({ ok: true, messages: msgs || [], participants: parts || [] });
      }
      case "logs": {
        let q = svc.from("audit_log").select("*").order("ts", { ascending: false }).limit(Math.min(body.limit || 200, 500));
        if (body.action_filter) q = q.eq("action", body.action_filter);
        if (body.actor) q = q.eq("actor_handle", body.actor);
        if (body.type) q = q.eq("target_type", body.type);
        const { data } = await q;
        return json({ ok: true, logs: data || [] });
      }
      case "ping": {
        await svc.from("profiles").update({ last_seen: new Date().toISOString() }).eq("user_id", user.id);
        if (body.event === "signin") await log("signin", "user", user.id, actorHandle, null);
        return json({ ok: true, role });
      }
      default:
        return json({ error: "unknown action" }, 400);
    }
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
