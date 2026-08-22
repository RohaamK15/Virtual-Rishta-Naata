// Approves or rejects a pending profile. This is the ONLY way profile_status
// ever becomes 'approved' — members have no direct write access to that
// column at all (see schema.sql's trg_reset_profile_status). Rejecting never
// touches subscription_status or deletes anything: the member keeps their
// subscription and can simply edit their profile to resubmit for review.
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";
import { sendFcmPush } from "../_shared/fcm.ts";

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

    // Best-effort push notification — previously a member only found out
    // their profile had been reviewed if they happened to open the app and
    // check account.html themselves. A failure here should never fail the
    // review action itself, same reasoning as send-message-push.
    try {
      const { data: member } = await admin
        .from("profiles")
        .select("push_token, push_platform, push_enabled")
        .eq("id", profile_id)
        .single();
      if (member?.push_token && member.push_enabled !== false && member.push_platform === "android") {
        const title = action === "approve" ? "Your profile has been approved!" : "Your profile needs a small update";
        const body = action === "approve"
          ? "Complete your membership from the app to start browsing and messaging."
          : (reason || "Please review and resubmit your profile from My Account.");
        await sendFcmPush(member.push_token, title, body, { url: "/account.html" });
      }
    } catch (pushErr) {
      console.warn("Profile review push notification failed:", pushErr);
    }

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
