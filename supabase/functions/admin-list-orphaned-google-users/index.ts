// Lists auth users who started a Google sign-in (creating an auth.users row
// and, since auth-callback.html now signs them straight back out, nothing
// else) but never actually signed up — no matching profiles row exists.
// These orphaned rows silently occupy their email, so a later real signup
// with the same email fails with "User already registered" even though the
// person has no working account. Admin-only, service-role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { admin } = await requireAdmin(req);

    const { data: profileRows, error: profileError } = await admin.from("profiles").select("id");
    if (profileError) throw profileError;
    const profileIds = new Set(profileRows.map((p) => p.id));

    const orphans: { id: string; email: string; created_at: string }[] = [];
    let page = 1;
    const perPage = 200;
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) throw error;
      for (const u of data.users) {
        if (profileIds.has(u.id)) continue;
        const isGoogle = (u.identities || []).some((i: { provider: string }) => i.provider === "google");
        if (!isGoogle) continue;
        orphans.push({ id: u.id, email: u.email || "(no email)", created_at: u.created_at });
      }
      if (data.users.length < perPage) break;
      page++;
    }

    orphans.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return new Response(JSON.stringify({ orphans }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.message === "Admin access required" ? 403 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
