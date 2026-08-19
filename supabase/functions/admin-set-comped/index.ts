// Grants or revokes admin-comped free access. Only ever touches is_comped —
// never subscription_status or profile_status. A comped member still needs
// profile_status = 'approved' like everyone else (see is_active_member() in
// schema.sql); this only ever substitutes for payment, never for approval.
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { admin } = await requireAdmin(req);
    const { profile_id, comped } = await req.json();
    if (!profile_id) throw new Error("profile_id is required");
    if (typeof comped !== "boolean") throw new Error("comped must be a boolean");

    const { error } = await admin.from("profiles").update({ is_comped: comped }).eq("id", profile_id);
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
