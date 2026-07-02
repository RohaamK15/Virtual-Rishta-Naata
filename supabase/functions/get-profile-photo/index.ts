// Returns a short-lived signed URL for a male member's optional photo, only to
// callers who are themselves active members. Photos are never exposed as
// public or permanently-signed URLs, and there is no storage RLS policy that
// lets one member directly read another member's file — this function is the
// only path, so every view can be gated on both members' subscription status.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

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

    const { data: me } = await supabase.from("profiles").select("subscription_status").eq("id", user.id).single();
    if (me?.subscription_status !== "active") throw new Error("Membership not active");

    const { ref_code } = await req.json();
    const { data: target, error: targetError } = await supabase
      .from("profiles")
      .select("gender, has_photo, photo_path, subscription_status")
      .eq("ref_code", ref_code)
      .single();
    if (targetError || !target) throw new Error("Profile not found");
    if (target.gender !== "M" || !target.has_photo || !target.photo_path) {
      return new Response(JSON.stringify({ url: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (target.subscription_status !== "active") throw new Error("Profile not active");

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: signed, error: signError } = await admin.storage
      .from("profile-photos")
      .createSignedUrl(target.photo_path, 300); // 5 minutes
    if (signError) throw signError;

    return new Response(JSON.stringify({ url: signed.signedUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
