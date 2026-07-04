// Returns unreviewed profile reports (whole-profile reports — fake account,
// inappropriate content, etc. — separate from the per-message reports in
// admin-list-flagged-messages) for admin review.
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { admin } = await requireAdmin(req);

    const { data: reports, error } = await admin
      .from("profile_reports")
      .select("id, reporter_id, reported_id, reason, created_at")
      .eq("reviewed_by_admin", false)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const profileIds = [...new Set((reports || []).flatMap((r) => [r.reporter_id, r.reported_id]))];
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, ref_code")
      .in("id", profileIds.length ? profileIds : ["00000000-0000-0000-0000-000000000000"]);
    const refCodeById = Object.fromEntries((profiles || []).map((p) => [p.id, p.ref_code]));

    const enriched = (reports || []).map((r) => ({
      ...r,
      reporter_ref: refCodeById[r.reporter_id] || "Unknown",
      reported_ref: refCodeById[r.reported_id] || "Unknown",
    }));

    return new Response(JSON.stringify({ reports: enriched }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.message === "Admin access required" ? 403 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
