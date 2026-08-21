// Public, no-auth-required aggregate count for the "Active members" stat on
// home.html — returns a number only, never any member data, so it's safe to
// call from signed-out visitors. Mirrors is_active_member()'s own definition
// (see schema.sql) rather than trusting a hardcoded marketing number.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { count, error } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("profile_status", "approved")
      .eq("is_admin", false)
      .or("subscription_status.eq.active,is_comped.eq.true");
    if (error) throw error;

    return new Response(JSON.stringify({ count: count || 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
