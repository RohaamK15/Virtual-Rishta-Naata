// Permanently deletes a member's auth account + profile row + any uploaded
// photo. Admin-only, service-role — see _shared/requireAdmin.ts.
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { admin } = await requireAdmin(req);
    const { ref_code } = await req.json();
    if (!ref_code) throw new Error("ref_code is required");

    const { data: target, error: findError } = await admin
      .from("profiles")
      .select("id, photo_path")
      .eq("ref_code", ref_code)
      .single();
    if (findError || !target) throw new Error("Profile not found");

    if (target.photo_path) {
      await admin.storage.from("profile-photos").remove([target.photo_path]);
    }
    // Deleting the auth user cascades to the profiles row (see schema.sql's
    // `references auth.users(id) on delete cascade`).
    const { error: deleteError } = await admin.auth.admin.deleteUser(target.id);
    if (deleteError) throw deleteError;

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
