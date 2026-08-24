// Returns the full message history for a conversation, for admin review of a
// flagged message or a reported profile — seeing only the single flagged
// message with no surrounding context makes it hard to judge what actually
// happened. Accepts either a conversation_id directly (flagged messages
// already have one) or a pair of member ids (profile reports don't - the
// conversation between them, if any, has to be looked up first).
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { admin } = await requireAdmin(req);
    const { conversation_id, member_a, member_b } = await req.json();

    let conversationId = conversation_id || null;

    if (!conversationId && member_a && member_b) {
      // Conversations are always stored with member_a < member_b (see
      // schema.sql), but checking both orderings directly here avoids
      // depending on JS string-sort producing the exact same order as
      // Postgres's own uuid comparison.
      const { data: conv } = await admin
        .from("conversations")
        .select("id")
        .or(`and(member_a.eq.${member_a},member_b.eq.${member_b}),and(member_a.eq.${member_b},member_b.eq.${member_a})`)
        .maybeSingle();
      conversationId = conv?.id || null;
    }

    if (!conversationId) {
      return new Response(JSON.stringify({ messages: [], conversation_found: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: conversation, error: convError } = await admin
      .from("conversations")
      .select("id, member_a, member_b")
      .eq("id", conversationId)
      .single();
    if (convError) throw convError;

    const { data: messages, error } = await admin
      .from("messages")
      .select("id, sender_id, body, flagged, flag_reason, reported, reported_reason, reviewed_by_admin, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const { data: profiles } = await admin
      .from("profiles")
      .select("id, ref_code")
      .in("id", [conversation.member_a, conversation.member_b]);
    const refCodeById = Object.fromEntries((profiles || []).map((p) => [p.id, p.ref_code]));

    const enriched = (messages || []).map((m) => ({
      ...m,
      sender_ref: refCodeById[m.sender_id] || "Unknown",
    }));

    return new Response(JSON.stringify({
      messages: enriched,
      conversation_found: true,
      member_refs: [refCodeById[conversation.member_a], refCodeById[conversation.member_b]],
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
