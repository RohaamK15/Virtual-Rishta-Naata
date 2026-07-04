// Returns messages that were either auto-flagged (looks like it shares
// contact details) or manually reported by a member, for admin review.
// Service-role only, after independently verifying the caller is_admin.
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { admin } = await requireAdmin(req);

    const { data: messages, error } = await admin
      .from("messages")
      .select("id, conversation_id, sender_id, body, flagged, flag_reason, reported, reported_reason, reviewed_by_admin, created_at")
      .or("flagged.eq.true,reported.eq.true")
      .eq("reviewed_by_admin", false)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const conversationIds = [...new Set((messages || []).map((m) => m.conversation_id))];
    const { data: conversations } = await admin
      .from("conversations")
      .select("id, member_a, member_b")
      .in("id", conversationIds.length ? conversationIds : ["00000000-0000-0000-0000-000000000000"]);
    const conversationsById = Object.fromEntries((conversations || []).map((c) => [c.id, c]));

    const profileIds = [...new Set(
      (conversations || []).flatMap((c) => [c.member_a, c.member_b])
    )];
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, ref_code")
      .in("id", profileIds.length ? profileIds : ["00000000-0000-0000-0000-000000000000"]);
    const refCodeById = Object.fromEntries((profiles || []).map((p) => [p.id, p.ref_code]));

    const enriched = (messages || []).map((m) => {
      const conv = conversationsById[m.conversation_id];
      const senderRef = refCodeById[m.sender_id] || "Unknown";
      const otherId = conv ? (conv.member_a === m.sender_id ? conv.member_b : conv.member_a) : null;
      const recipientRef = otherId ? (refCodeById[otherId] || "Unknown") : "Unknown";
      return { ...m, sender_ref: senderRef, recipient_ref: recipientRef };
    });

    return new Response(JSON.stringify({ messages: enriched }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.message === "Admin access required" ? 403 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
