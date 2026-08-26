// Public, unauthenticated endpoint hit from the "Unsubscribe" link stamped
// into every marketing email (see admin-send-email-broadcast) — a member
// clicking it from their email client isn't signed in on that device, so
// this can't require a JWT. In the Supabase Dashboard, this function's
// "Enforce JWT Verification" setting must be turned OFF (same as
// stripe-webhook / revenuecat-webhook, which are hit by outside services
// with no Supabase session either).
//
// Matches {id, t} against profiles.id / profiles.unsubscribe_token — an
// unguessable per-member token, never exposed to any authenticated client
// (see schema.sql), so this can only be reached via the exact link that was
// actually emailed to that member.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { id, t } = await req.json();
    if (!id || !t) throw new Error("Missing id or token");

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await admin
      .from("profiles")
      .update({ email_marketing_opt_out: true })
      .eq("id", id)
      .eq("unsubscribe_token", t)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("This unsubscribe link is invalid or has expired");

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
