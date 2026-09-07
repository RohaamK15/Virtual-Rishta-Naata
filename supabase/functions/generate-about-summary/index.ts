// Generates a genuinely concise, one-sentence AI summary of a member's
// About text — computed once here (called from edit-profile.html whenever
// `about` changes) rather than re-summarized on every browse-card render.
// See submit-profile-for-review for the signup-time equivalent (inlined
// there rather than calling this function, since that one already runs
// with service-role access and creating the profile).
//
// Requires the ANTHROPIC_API_KEY secret (Supabase Dashboard > Edge
// Functions > generate-about-summary > Secrets, or project-wide secrets) —
// an API key from console.anthropic.com, not a claude.ai login.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");
    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await admin.auth.getUser(jwt);
    if (userError || !user) throw new Error("Not authenticated");

    const { about } = await req.json();
    if (!about || typeof about !== "string" || !about.trim()) {
      // Nothing to summarise (e.g. About was cleared) — clear any stale
      // summary rather than leaving an old one describing text that's gone.
      await admin.from("profiles").update({ about_summary: null }).eq("id", user.id);
      return new Response(JSON.stringify({ success: true, about_summary: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("Summarization is not configured (missing ANTHROPIC_API_KEY).");

    const prompt = `Summarize the following "About Me" text, written by someone on a matrimonial platform, as ONE natural-sounding sentence in first person (as if they wrote it themselves) — no more than 20 words. Capture the most distinctive details (personality, profession, interests, values), not a generic restatement. Return ONLY the sentence itself, with no quotation marks, preamble, or explanation.\n\nAbout Me text:\n"""\n${about.trim()}\n"""`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 80,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!aiRes.ok) throw new Error(`Summarization request failed: ${await aiRes.text()}`);
    const aiData = await aiRes.json();
    const summary = aiData?.content?.[0]?.text?.trim();
    if (!summary) throw new Error("Summarization returned no text.");

    const { error: updateError } = await admin.from("profiles").update({ about_summary: summary }).eq("id", user.id);
    if (updateError) throw updateError;

    return new Response(JSON.stringify({ success: true, about_summary: summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
