// Marks a flagged/reported message as reviewed so it drops off the admin
// dashboard's queue. Doesn't delete or alter the message itself — just the
// review state — so there's always a record of what was looked at.
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { admin } = await requireAdmin(req);
    const { message_id } = await req.json();
    if (!message_id) throw new Error("message_id is required");

    const { error } = await admin.from("messages").update({ reviewed_by_admin: true }).eq("id", message_id);
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
