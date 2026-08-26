// Lists every From alias ever actually sent with, most recently used first —
// backs the autocomplete dropdown on the Send Email panel's "From alias"
// input, independent of which template (if any) is selected.
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { admin } = await requireAdmin(req);
    const { data, error } = await admin
      .from("email_from_alias")
      .select("alias")
      .order("last_used_at", { ascending: false });
    if (error) throw error;

    return new Response(JSON.stringify({ aliases: (data || []).map((r) => r.alias) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.message === "Admin access required" ? 403 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
