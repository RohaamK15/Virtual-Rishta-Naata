// Updates the single home_banner row in site_announcement — the only way
// this ever changes, since the table has no INSERT/UPDATE grant for anon or
// authenticated at all. Turning a promo/announcement on or off this way
// takes effect instantly for every visitor and every already-installed app,
// no rebuild or release involved.
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";
import { logAdminAction } from "../_shared/logAdminAction.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { admin, user } = await requireAdmin(req);
    const { active, message, link_url, link_text } = await req.json();
    if (typeof active !== "boolean") throw new Error("active must be a boolean");

    const { error } = await admin.from("site_announcement").update({
      active,
      message: message || null,
      link_url: link_url || null,
      link_text: link_text || null,
      updated_at: new Date().toISOString(),
    }).eq("id", "home_banner");
    if (error) throw error;

    await logAdminAction(admin, user.id, "announcement_update", null, `active=${active} message=${message || ""}`);

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
