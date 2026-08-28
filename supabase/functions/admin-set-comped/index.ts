// Grants or revokes admin-comped free access. Only ever touches is_comped —
// never subscription_status or profile_status. A comped member still needs
// profile_status = 'approved' like everyone else (see is_active_member() in
// schema.sql); this only ever substitutes for payment, never for approval.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Verifies the caller's JWT and checks is_admin using the service-role key —
// never trust an is_admin claim supplied by the client itself.
async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Missing Authorization header");

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt = authHeader.replace("Bearer ", "");
  const { data: { user }, error: userError } = await admin.auth.getUser(jwt);
  if (userError || !user) throw new Error("Not authenticated");

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (profileError || !profile?.is_admin) throw new Error("Admin access required");

  return { admin, user };
}

// Writes one row to admin_action_log — see schema.sql for why this table
// exists (it backs the Privacy Policy's "administrative access is...
// logged" promise). Deliberately fire-and-forget from the caller's
// perspective: a logging failure must never block or fail the actual admin
// action it's recording.
// deno-lint-ignore no-explicit-any
async function logAdminAction(
  admin: any,
  adminId: string,
  action: string,
  targetProfileId?: string | null,
  detail?: string | null,
) {
  try {
    await admin.from("admin_action_log").insert({
      admin_id: adminId,
      action,
      target_profile_id: targetProfileId || null,
      detail: detail || null,
    });
  } catch (err) {
    console.warn("logAdminAction failed:", err);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { admin, user } = await requireAdmin(req);
    const { profile_id, comped } = await req.json();
    if (!profile_id) throw new Error("profile_id is required");
    if (typeof comped !== "boolean") throw new Error("comped must be a boolean");

    // Returns the member's contact_email/ref_code alongside success so the
    // caller (admin.html) can send the profile-decision notification email
    // without a second round-trip — see notifyProfileDecision().
    const { data, error } = await admin.from("profiles").update({ is_comped: comped }).eq("id", profile_id)
      .select("contact_email, ref_code").single();
    if (error) throw error;
    await logAdminAction(admin, user.id, comped ? "comp_grant" : "comp_revoke", profile_id);

    return new Response(JSON.stringify({ success: true, contact_email: data?.contact_email, ref_code: data?.ref_code }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.message === "Admin access required" ? 403 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
