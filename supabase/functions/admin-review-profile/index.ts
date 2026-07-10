// Approves or rejects a pending profile. This is the ONLY way profile_status
// ever becomes 'approved' — members have no direct write access to that
// column at all (see schema.sql's trg_reset_profile_status). Rejecting never
// touches subscription_status or deletes anything: the member keeps their
// subscription and can simply edit their profile to resubmit for review.
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { admin } = await requireAdmin(req);
    const { profile_id, action, reason } = await req.json();
    if (!profile_id) throw new Error("profile_id is required");
    if (!["approve", "reject"].includes(action)) throw new Error("action must be 'approve' or 'reject'");

    const { error } = await admin.from("profiles").update({
      profile_status: action === "approve" ? "approved" : "rejected",
      profile_rejection_reason: action === "reject" ? (reason || "Did not meet our community standards") : null,
    }).eq("id", profile_id);
    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.message === "Admin access required" ? 403 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
