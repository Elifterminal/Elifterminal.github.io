# CanyonSoc — turn on the live NPS feed

The site already pulls **real, live** weather (Open-Meteo), severe-weather alerts
(weather.gov / NWS), and the dark-sky window + moon phase — all keyless.

The one National Park Service feed (park alerts + ranger night-sky programs) needs a
free NPS key. To keep that key out of the public repo, the browser calls a tiny
Supabase Edge Function that holds the key server-side. Two short steps:

## 1. Get a free NPS API key (1 min)
- Go to https://www.nps.gov/subjects/developer/get-started.htm
- Click **Get Started / Request an API key**, enter your email.
- The key arrives by email instantly. Copy it.

## 2. Deploy the proxy + set the key

**Easiest — Supabase dashboard:**
1. Open your project → **Edge Functions** → **Create a function**.
2. Name it exactly `nps`. Paste the contents of `supabase/functions/nps/index.ts`.
   When it asks, **turn OFF "Verify JWT"** (the page reads it without sign-in).
3. **Deploy.**
4. Still in Edge Functions → **Secrets** (or Project Settings → Edge Functions →
   Manage secrets) → add a secret: name `NPS_API_KEY`, value = the key from step 1.
   Save. (Re-deploy if it asks.)

**Or with the CLI**, from this folder:
```
supabase functions deploy nps --no-verify-jwt
supabase secrets set NPS_API_KEY=PASTE_YOUR_KEY
```

That's it. The "Live park alerts" panel and the ranger night-sky programs under the
Sky Party feed switch from "Connecting to the NPS feed…" to real data within a minute.
Nothing to change in the HTML — it already points at the function.
