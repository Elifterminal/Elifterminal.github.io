// CanyonSoc — NPS proxy (Supabase Edge Function)
// Holds the free developer.nps.gov API key as a server-side secret so it never
// ships in the public client. The browser calls:
//   GET /functions/v1/nps?type=alerts   -> live Grand Canyon park alerts
//   GET /functions/v1/nps?type=events   -> live ranger programs (sky party feed)
// Returns the standard envelope: { success, data, error }.
//
// Deploy via the Supabase dashboard editor (Edge Functions -> Via Editor),
// name it "nps", turn Verify JWT OFF, then set the secret:
//   Project Settings -> Edge Functions -> Secrets: NPS_API_KEY = <key>
// Get a free key at https://www.nps.gov/subjects/developer/get-started.htm
//
// Note: every line is kept short on purpose — the dashboard editor can hard-wrap
// long lines on paste and break a string literal.

const PARK = "grca";
const NPS = "https://developer.nps.gov/api/v1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(body, status = 200) {
  const h = { ...cors, "content-type": "application/json" };
  return new Response(JSON.stringify(body), { status, headers: h });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  const key = Deno.env.get("NPS_API_KEY");
  if (!key) {
    return json({ success: false, data: [], error: "no key" }, 500);
  }
  const sp = new URL(req.url).searchParams;
  const type = sp.get("type") === "events" ? "events" : "alerts";
  const url = NPS + "/" + type + "?parkCode=" + PARK +
    "&api_key=" + encodeURIComponent(key) + "&limit=50";
  try {
    const r = await fetch(url, { headers: { accept: "application/json" } });
    if (!r.ok) {
      return json({ success: false, data: [], error: "nps " + r.status }, 502);
    }
    const j = await r.json();
    return json({ success: true, data: j?.data ?? [], error: null });
  } catch (e) {
    return json({ success: false, data: [], error: String(e) }, 502);
  }
});
