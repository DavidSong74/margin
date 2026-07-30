// Margin — Transcription Edge Function
// Runtime: Deno (Supabase Edge Functions)
//
// Deploy: supabase functions deploy transcribe
// Secrets: supabase secrets set GEMINI_API_KEY=<key> SUPABASE_SERVICE_ROLE_KEY=<key>
//
// Request body: { page_id: string }
// Auth: Bearer <user JWT> in Authorization header

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding/base64";

// ── Constants ──────────────────────────────────────────────

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const GLOSSARY_CAP = 50; // max glossary entries injected into prompt

// ── Main handler ───────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // ── 1. Verify JWT ────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Missing authorization" }, 401);
  }
  const userToken = authHeader.slice(7);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const geminiKey = Deno.env.get("GEMINI_API_KEY")!;

  // Anon client — used only for JWT verification
  const anonClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: { user }, error: userErr } = await anonClient.auth.getUser(userToken);
  if (userErr || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  // ── 2. Parse body ────────────────────────────────────────
  let page_id: string;
  try {
    const body = await req.json();
    page_id = body.page_id;
    if (!page_id) throw new Error("missing fields");
  } catch {
    return json({ error: "Invalid request body — expected { page_id }" }, 400);
  }

  // Service-role client — bypasses RLS for storage access and page writes
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // ── 3. Verify the page belongs to this user ──────────────
  const { data: pageRow, error: pageErr } = await adminClient
    .from("pages")
    .select("id, journal_id, image_path, transcription_status, journals!inner(user_id)")
    .eq("id", page_id)
    .single();

  if (pageErr || !pageRow) {
    return json({ error: "Page not found" }, 404);
  }

  // TypeScript: access nested join result
  const journalOwner = (pageRow as unknown as { journals: { user_id: string } }).journals.user_id;
  if (journalOwner !== user.id) {
    return json({ error: "Forbidden" }, 403);
  }

  // ── 4. Mark page as processing ───────────────────────────
  await adminClient
    .from("pages")
    .update({ transcription_status: "processing" })
    .eq("id", page_id);

  const image_path = (pageRow as unknown as { image_path: string }).image_path;

  try {
    // ── 5. Download image from Storage ─────────────────────
    const { data: imageBlob, error: dlErr } = await adminClient.storage
      .from("journal_pages")
      .download(image_path);

    if (dlErr || !imageBlob) {
      throw new Error(`Storage download failed: ${dlErr?.message}`);
    }

    // Convert blob to base64
    const imageBuffer = await imageBlob.arrayBuffer();
    const imageBytes = new Uint8Array(imageBuffer);
    const base64Image = encodeBase64(imageBytes);

    // ── 6. Fetch glossary (cap at 50 most-recently updated) ──
    const { data: glossaryRows } = await adminClient
      .from("glossary")
      .select("original_word, corrected_word")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(GLOSSARY_CAP);

    const glossaryHint =
      glossaryRows && glossaryRows.length > 0
        ? `The user has previously corrected these handwriting misinterpretations (original → correct):\n${glossaryRows.map((g) => `  "${g.original_word}" → "${g.corrected_word}"`).join("\n")}\nApply these corrections when you see similar patterns.`
        : "";

    // ── 7. First Gemini pass — full transcription ───────────
    const systemInstructions = [
      "You are an expert at transcribing handwritten text from journal pages.",
      "Transcribe all visible handwritten text exactly as written, preserving line breaks.",
      "Return ONLY the transcribed text — no commentary, no formatting, no markdown.",
      glossaryHint,
    ]
      .filter(Boolean)
      .join("\n\n");

    const transcriptionText = await callGemini(geminiKey, {
      systemInstruction: { parts: [{ text: systemInstructions }] },
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "image/jpeg", data: base64Image } },
            { text: "Transcribe all handwritten text on this journal page." },
          ],
        },
      ],
    });

    // ── 8. Second Gemini pass — uncertain words ─────────────
    // Ask Gemini to identify words it was uncertain about.
    // Returns a JSON array of { original, suggested } objects.
    const uncertainJson = await callGemini(geminiKey, {
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "image/jpeg", data: base64Image } },
            {
              text: [
                "Given the following transcription of the handwritten text on this page, list any individual words you were uncertain about.",
                "For each uncertain word, provide your best guess for the intended word.",
                "",
                `Transcription:\n${transcriptionText}`,
                "",
                'Return ONLY a valid JSON array. Each element must be {"original": "<uncertain word>", "suggested": "<best guess>"}.',
                "If you were not uncertain about any words, return an empty array: []",
              ].join("\n"),
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    // Parse uncertain words — fail gracefully if Gemini returns malformed JSON
    let pendingCorrections: Array<{ original: string; suggested: string }> = [];
    try {
      const parsed = JSON.parse(uncertainJson);
      if (Array.isArray(parsed)) {
        pendingCorrections = parsed.filter(
          (item) => typeof item?.original === "string" && typeof item?.suggested === "string",
        );
      }
    } catch {
      // Malformed JSON from Gemini — continue with empty corrections
      console.warn("[transcribe] Could not parse uncertain words JSON:", uncertainJson.slice(0, 200));
    }

    // ── 9. Write results to database ────────────────────────
    const { error: updateErr } = await adminClient
      .from("pages")
      .update({
        transcription_text: transcriptionText,
        transcription_status: "done",
        pending_corrections: pendingCorrections,
        correction_count: pendingCorrections.length,
      })
      .eq("id", page_id);

    if (updateErr) throw new Error(`DB update failed: ${updateErr.message}`);

    return json({ success: true, correction_count: pendingCorrections.length });
  } catch (err) {
    // ── 10. Mark page as failed and return 500 ──────────────
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[transcribe] page=${page_id} user=${user.id} error:`, errMsg);

    await adminClient
      .from("pages")
      .update({ transcription_status: "failed" })
      .eq("id", page_id);

    return json({ error: "Transcription failed", detail: errMsg }, 500);
  }
});

// ── Helpers ────────────────────────────────────────────────

async function callGemini(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<string> {
  const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini API error ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") {
    throw new Error("Gemini returned unexpected response shape");
  }
  return text;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
