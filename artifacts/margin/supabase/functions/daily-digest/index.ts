// Margin — Daily Digest Edge Function
// Runtime: Deno (Supabase Edge Functions)
//
// Deploy:  supabase functions deploy daily-digest
// Schedule via pg_cron (run once after applying 008_pending_counts.sql):
//   SELECT cron.schedule('daily-digest', '0 10 * * *',
//     $$SELECT net.http_post(
//       url := '<SUPABASE_URL>/functions/v1/daily-digest',
//       headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
//       body := '{}'::jsonb
//     ) AS request_id;$$
//   );
//
// Secrets: SUPABASE_SERVICE_ROLE_KEY, EXPO_ACCESS_TOKEN (Expo push API)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const CHUNK_SIZE = 100; // Expo push API max per request

Deno.serve(async (req: Request) => {
  // Require service-role auth to prevent public invocation
  const authHeader = req.headers.get("Authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!authHeader.includes(serviceKey)) {
    return json({ error: "Forbidden" }, 403);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const expoAccessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
  const admin = createClient(supabaseUrl, serviceKey);

  const today = new Date();
  const oneYearAgo = new Date(today);
  oneYearAgo.setFullYear(today.getFullYear() - 1);

  // ── 1. Find users with on_this_day enabled ──────────────────
  const { data: tokens, error: tokenErr } = await admin
    .from("push_tokens")
    .select("user_id, token")
    .eq("on_this_day_enabled", true);

  if (tokenErr || !tokens?.length) {
    return json({ sent: 0 });
  }

  // ── 2. For each user, check for pages written a year ago ────
  const messages: Array<{
    to: string;
    title: string;
    body: string;
    sound: string;
  }> = [];

  for (const { user_id, token } of tokens) {
    const dayStart = new Date(oneYearAgo);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(oneYearAgo);
    dayEnd.setHours(23, 59, 59, 999);

    const { data: pages } = await admin
      .from("pages")
      .select("transcription_text, journals!inner(user_id, title)")
      .eq("journals.user_id", user_id)
      .gte("created_at", dayStart.toISOString())
      .lte("created_at", dayEnd.toISOString())
      .is("deleted_at", null)
      .not("transcription_text", "is", null)
      .limit(3);

    if (!pages?.length) continue;

    // Pick the first non-empty snippet (first ~80 chars)
    const snippet = pages
      .map((p: any) => (p.transcription_text ?? "").trim())
      .find((t: any) => t.length > 10);

    if (!snippet) continue;

    const preview =
      snippet.length > 80 ? snippet.slice(0, 77) + "…" : snippet;

    messages.push({
      to: token,
      title: "On this day",
      body: `A year ago you wrote: "${preview}"`,
      sound: "default",
    });
  }

  if (!messages.length) {
    return json({ sent: 0, reason: "no_entries_found" });
  }

  // ── 3. Send in chunks via Expo Push API ─────────────────────
  let sent = 0;
  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    const chunk = messages.slice(i, i + CHUNK_SIZE);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
    };
    if (expoAccessToken) {
      headers["Authorization"] = `Bearer ${expoAccessToken}`;
    }
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(chunk),
    });
    if (res.ok) sent += chunk.length;
  }

  return json({ sent });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
