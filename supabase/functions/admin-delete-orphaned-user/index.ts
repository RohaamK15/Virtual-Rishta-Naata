// Deletes a single orphaned auth.users row (one created by a Google sign-in
// attempt that never became a real signup) so its email is freed up for a
// genuine signup. Deliberately refuses to touch any id that actually has a
// profiles row — that's a real member and must go through
// admin-delete-profile instead, which also handles their Stripe
// subscription and uploaded photo. Admin-only, service-role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";
import { logAdminAction } from "../_shared/logAdminAction.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { admin, user } = await requireAdmin(req);
    const { id } = await req.json();
    if (!id) throw new Error("id is required");

    const { data: profile } = await admin.from("profiles").select("id").eq("id", id).maybeSingle();
    if (profile) throw new Error("This account has a profile and is not orphaned — use the member delete action instead.");

    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
    // No profiles row exists for an orphan, so target_profile_id can't
    // reference it (the FK would fail) — the orphaned auth user's id goes in
    // detail instead.
    await logAdminAction(admin, user.id, "orphaned_user_delete", null, id);

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
