// Lets an already-authenticated member (re)submit their Ahmadi verification
// answers when editing their profile — every content edit resets
// profile_status to 'pending' (see trg_reset_profile_status in schema.sql),
// so a fresh review always needs fresh answers, since admin-review-profile
// deletes the previous row the moment a decision is made.
//
// Upserts rather than inserts: a member resubmitting after a rejection (or
// editing again before an admin got to their first pending submission)
// replaces their previous answers rather than erroring on the existing row.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const VERIFICATION_FIELDS = ["local_jamaat", "sadr_name_contact", "positions_held", "joined_jamaat", "jamaat_activity"];

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

    const body = await req.json();
    const picked: Record<string, string> = {};
    for (const key of VERIFICATION_FIELDS) {
      const value = typeof body[key] === "string" ? body[key].trim() : "";
      if (!value) throw new Error("Please answer every Ahmadi verification question");
      picked[key] = value;
    }

    // Must be a path this same user actually owns in verification-videos
    // (their own storage folder) — never trust a client-supplied path
    // otherwise, since it would let anyone attach an arbitrary object
    // (including someone else's video) to their own verification record.
    const videoPath = typeof body.video_path === "string" ? body.video_path.trim() : "";
    if (!videoPath || !videoPath.startsWith(`${user.id}/`)) {
      throw new Error("A self-introduction video is required");
    }
    const { data: videoExists } = await admin.storage.from("verification-videos").list(user.id);
    const fileName = videoPath.slice(user.id.length + 1);
    if (!videoExists?.some((f) => f.name === fileName)) {
      throw new Error("We couldn't find your uploaded video — please try uploading it again");
    }

    const { error } = await admin.from("profile_verification").upsert({
      profile_id: user.id,
      ...picked,
      video_path: videoPath,
    });
    if (error) throw error;

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
