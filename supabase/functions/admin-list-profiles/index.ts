// Returns every client profile (any status) for the admin dashboard. Uses the
// service-role key server-side only, after independently verifying the
// caller is_admin — the browser never holds the service-role key.
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { admin } = await requireAdmin(req);
    const { data, error } = await admin
      .from("profiles")
      .select("id, ref_code, gender, age, city, county, country, country_looking_in, contact_email, subscription_status, profile_status, plan, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;

    return new Response(JSON.stringify({ profiles: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.message === "Admin access required" ? 403 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
