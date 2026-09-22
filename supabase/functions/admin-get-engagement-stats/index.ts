// Returns platform-wide engagement counts (total conversations started,
// total messages sent) for the admin dashboard. Deliberately count-only —
// this never selects message/conversation content, member identities, or
// anything else; it's the privacy-safe way to answer "how much is the
// platform actually being used" without reading anyone's actual messages
// (see admin-get-conversation-messages for the separate, content-reading
// function used for moderating a specific flagged/reported conversation).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { admin } = await requireAdmin(req);

    const [{ count: conversationCount, error: convError }, { count: messageCount, error: msgError }] = await Promise.all([
      admin.from("conversations").select("id", { count: "exact", head: true }),
      admin.from("messages").select("id", { count: "exact", head: true }),
    ]);
    if (convError) throw convError;
    if (msgError) throw msgError;

    return new Response(JSON.stringify({
      success: true,
      conversations: conversationCount || 0,
      messages: messageCount || 0,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.message === "Admin access required" ? 403 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
