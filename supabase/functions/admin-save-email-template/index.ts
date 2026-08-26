// Creates a new email template, or updates an existing one if an id is
// given. Used by the broadcast tool's "Save as Template" action.
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";
import { logAdminAction } from "../_shared/logAdminAction.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { admin, user } = await requireAdmin(req);
    const { id, name, subject, body, is_html } = await req.json();
    if (!name || !subject || !body) throw new Error("Name, subject, and message are required");

    let savedId = id;
    if (id) {
      const { error } = await admin.from("email_template").update({
        name, subject, body, is_html: !!is_html, updated_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
    } else {
      const { data, error } = await admin.from("email_template").insert({
        name, subject, body, is_html: !!is_html,
      }).select("id").single();
      if (error) throw error;
      savedId = data.id;
    }

    await logAdminAction(admin, user.id, id ? "email_template_update" : "email_template_create", null, name);

    return new Response(JSON.stringify({ success: true, id: savedId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.message === "Admin access required" ? 403 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
