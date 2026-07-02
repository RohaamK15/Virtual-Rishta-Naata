// Handles the Services page's consultation booking form: stores the request
// and emails a notification to the team via Resend. No auth required — this
// is open to visitors who haven't created a profile yet.
//
// Requires these secrets (Project Settings > Edge Functions > Secrets):
//   RESEND_API_KEY   — from https://resend.com (free tier is enough for this)
//   NOTIFY_EMAIL     — the inbox that should receive new consultation requests
// Until both are set, requests are still saved to the database — the email
// step is skipped quietly rather than failing the whole request.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { email, ref_code, message } = await req.json();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Please enter a valid email address.");
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { error: insertError } = await supabase
      .from("consultation_requests")
      .insert({ email, ref_code: ref_code || null, message: message || null });
    if (insertError) throw insertError;

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const notifyTo = Deno.env.get("NOTIFY_EMAIL");
    if (resendKey && notifyTo) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Virtual Rishta Naata <onboarding@resend.dev>",
          to: notifyTo,
          reply_to: email,
          subject: "New consultation request",
          text: [
            `New one-to-one consultation request.`,
            ``,
            `Email: ${email}`,
            `Reference code: ${ref_code || "(not provided — not yet a member, or didn't share it)"}`,
            ``,
            `Message:`,
            message || "(no message provided)",
          ].join("\n"),
        }),
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
