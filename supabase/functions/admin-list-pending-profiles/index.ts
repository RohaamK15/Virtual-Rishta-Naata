// Returns every profile awaiting whole-profile review (as opposed to just the
// photo — see admin-list-pending-photos for that). Admin reviews the actual
// content here since fake/inappropriate profiles can't be caught from a
// ref code and a photo alone.
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { admin } = await requireAdmin(req);

    const { data: profiles, error } = await admin
      .from("profiles")
      .select(
        "id, ref_code, gender, age, height, qualifications, employment, residential_status, " +
        "city, county, country, is_ahmadi, local_jamaat, had_previous, previous_type, " +
        "previous_duration, has_children, preference_line, country_looking_in, " +
        "consider_pakistan, additional_note, about, created_at"
      )
      .eq("profile_status", "pending")
      .order("created_at", { ascending: true });
    if (error) throw error;

    return new Response(JSON.stringify({ profiles: profiles || [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.message === "Admin access required" ? 403 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
