// Marks a profile report as reviewed so it drops off the admin dashboard's
// queue. Doesn't take any action on the reported account itself — that's a
// separate, deliberate decision an admin makes via admin-delete-profile if
// warranted.
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { admin } = await requireAdmin(req);
    const { report_id } = await req.json();
    if (!report_id) throw new Error("report_id is required");

    const { error } = await admin.from("profile_reports").update({ reviewed_by_admin: true }).eq("id", report_id);
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
