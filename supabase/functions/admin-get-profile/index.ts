// Returns one profile's full record for the admin dashboard's "View full
// record" action — admin-list-profiles only selects a lean summary set for
// the table, so this is a separate on-demand fetch rather than bloating
// every row load with fields (photo included) only needed when opened.
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { admin } = await requireAdmin(req);
    const { ref_code } = await req.json();
    if (!ref_code) throw new Error("ref_code is required");

    const { data: profile, error } = await admin
      .from("profiles")
      .select("*, profile_verification(local_jamaat, sadr_name_contact, positions_held, joined_jamaat, jamaat_activity)")
      .eq("ref_code", ref_code)
      .single();
    if (error) throw error;

    let photo_url = null;
    if (profile.has_photo && profile.photo_path) {
      const { data: signed } = await admin.storage.from("profile-photos").createSignedUrl(profile.photo_path, 300);
      photo_url = signed?.signedUrl || null;
    }

    // profile_verification is a to-one relation via primary key, but
    // PostgREST always returns embedded relations as an array — flatten it,
    // and be explicit when it's missing (already reviewed and deleted —
    // expected once profile_status is no longer 'pending').
    const rawVerification = (profile as Record<string, unknown>).profile_verification;
    const profile_verification = Array.isArray(rawVerification) ? rawVerification[0] || null : rawVerification;

    return new Response(JSON.stringify({ profile: { ...profile, profile_verification, photo_url } }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.message === "Admin access required" ? 403 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
