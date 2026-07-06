// Sends a push notification to the recipient of a chat message, called by
// the client right after a successful insert (see chat.html's sendMessage).
// Best-effort — a failure here should never block the message itself from
// having already sent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sendFcmPush } from "../_shared/fcm.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("Not authenticated");

    const { message_id } = await req.json();
    if (!message_id) throw new Error("message_id is required");

    const { data: message } = await admin
      .from("messages")
      .select("id, conversation_id, sender_id, body")
      .eq("id", message_id)
      .single();
    // Only the sender can trigger a push for their own message — stops
    // anyone from spamming pushes to arbitrary recipients via this endpoint.
    if (!message || message.sender_id !== user.id) throw new Error("Message not found");

    const { data: conversation } = await admin
      .from("conversations")
      .select("member_a, member_b")
      .eq("id", message.conversation_id)
      .single();
    if (!conversation) throw new Error("Conversation not found");

    const recipientId = conversation.member_a === user.id ? conversation.member_b : conversation.member_a;

    const { data: sender } = await admin.from("profiles").select("ref_code").eq("id", user.id).single();
    const { data: recipient } = await admin.from("profiles").select("push_token, push_platform").eq("id", recipientId).single();

    if (!recipient?.push_token) {
      return new Response(JSON.stringify({ skipped: "recipient has no push token" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Android only for now — iOS push needs an APNs key connected to the
    // Firebase project before recipient.push_platform === 'ios' can be sent to.
    if (recipient.push_platform !== "android") {
      return new Response(JSON.stringify({ skipped: `push not yet supported for ${recipient.push_platform}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await sendFcmPush(
      recipient.push_token,
      `Message from ${sender?.ref_code || "a member"}`,
      message.body.length > 120 ? message.body.slice(0, 117) + "..." : message.body
    );

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
