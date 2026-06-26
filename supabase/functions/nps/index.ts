// CanyonSoc — NPS proxy (Supabase Edge Function)
// Holds the free developer.nps.gov API key as a server-side secret so it never
// ships in the public client. The browser calls:
//   GET /functions/v1/nps?type=alerts   -> live Grand Canyon park alerts
//   GET /functions/v1/nps?type=events   -> live ranger programs (sky party feed)
// Returns the standard envelope: { success, data, error }.
//
// Deploy (dashboard or CLI) and set the secret:
//   supabase secrets set NPS_API_KEY=xxxxxxxx
//   supabase functions deploy nps --no-verify-jwt
// Get a free key at https://www.nps.gov/subjects/developer/get-started.htm

const PARK = "grca"; // Grand Canyon National Park
const NPS = "https://developer.nps.gov/api/v1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const key = Deno.env.get("NPS_API_KEY");
  if (!key) return json({ success: false, data: [], error: "NPS_API_KEY not set" }, 500);

  const type = new URL(req.url).searchParams.get("type") || "alerts";
  const path = type === "events" ? "events" : "alerts";
  const url = `${NPS}/${path}?parkCode=${PARK}&api_key=${encodeURIComponent(key)}&limit=50`;

  try {
    const r = await fetch(url, { headers: { accept: "application/json" } });
    if (!r.ok) return json({ success: false, data: [], error: `NPS ${r.status}` }, 502);
    const j = await r.json();
    return json({ success: true, data: j?.data ?? [], error: null });
  } catch (e) {
    return json({ success: false, data: [], error: String(e) }, 502);
  }
});
