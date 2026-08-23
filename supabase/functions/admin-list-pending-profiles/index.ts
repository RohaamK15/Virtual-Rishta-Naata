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
        "id, ref_code, gender, age, height, qualifications, employment, immigration_status, " +
        "city, county, country, is_ahmadi, local_jamaat, had_previous, previous_type, " +
        "previous_duration, has_children, preference_line, country_looking_in, " +
        "consider_pakistan, additional_note, about, created_at, " +
        "profile_verification(local_jamaat, sadr_name_contact, positions_held, joined_jamaat, jamaat_activity)"
      )
      .eq("profile_status", "pending")
      .eq("is_admin", false)
      .order("created_at", { ascending: true });
    if (error) throw error;

    // profile_verification is a to-one relation via primary key, but
    // PostgREST always returns embedded relations as an array — flatten it
    // for the dashboard, and be explicit when it's missing (already
    // reviewed and deleted, or somehow never submitted) rather than letting
    // undefined silently render as blank.
    const withVerification = (profiles || []).map((p: Record<string, unknown>) => {
      const v = Array.isArray(p.profile_verification) ? p.profile_verification[0] : p.profile_verification;
      return { ...p, profile_verification: v || null };
    });

    return new Response(JSON.stringify({ profiles: withVerification }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.message === "Admin access required" ? 403 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
