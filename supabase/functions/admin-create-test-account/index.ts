// Creates a fully active, approved account without going through Stripe —
// for comp/test accounts (e.g. a paid testing community) that shouldn't be
// charged. Admin-gated like every other admin-* function.
//
// Inlined (no relative imports) — the Supabase Dashboard's bundler can't
// resolve ../_shared/* paths when pasted directly, a recurring gotcha in
// this project's manual-deploy workflow.
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
    const { email, password, gender, age, city, country, about, pendingWithVerification } = await req.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("A valid email is required");
    if (!password || password.length < 8) throw new Error("Password must be at least 8 characters");
    if (!["M", "F"].includes(gender)) throw new Error("Gender must be 'M' or 'F'");
    if (!age || age < 18 || age > 90) throw new Error("Age must be between 18 and 90");

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError) throw createError;

    // pendingWithVerification: for testing the Ahmadi Verification retention
    // fix specifically (see project_verification_retention_bug memory) —
    // creates the account 'pending' with a real profile_verification row
    // (incl. an actual uploaded video) instead of the normal pre-approved
    // comp account, so there's something genuine to Approve in admin.html
    // and then check was actually deleted afterward.
    const { error: profileError } = await admin.from("profiles").insert({
      id: created.user.id,
      gender,
      age,
      city: city || null,
      country: country || null,
      about: about || "Test account for our closed-testing community.",
      contact_email: email,
      plan: "monthly",
      subscription_status: pendingWithVerification ? "pending" : "active",
      profile_status: pendingWithVerification ? "pending" : "approved",
      is_ahmadi: pendingWithVerification ? true : undefined,
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id);
      throw profileError;
    }

    if (pendingWithVerification) {
      const videoBytes = new TextEncoder().encode("fake test video content — not a real video file");
      const videoPath = `${created.user.id}/intro.mp4`;
      const { error: uploadError } = await admin.storage
        .from("verification-videos")
        .upload(videoPath, videoBytes, { contentType: "video/mp4", upsert: true });
      if (uploadError) {
        await admin.auth.admin.deleteUser(created.user.id);
        throw uploadError;
      }
      const { error: verificationError } = await admin.from("profile_verification").insert({
        profile_id: created.user.id,
        local_jamaat: "Test Jamaat",
        sadr_name_contact: "Test Sadr — 07000 000000",
        positions_held: "None (test account)",
        joined_jamaat: "2020",
        jamaat_activity: "Test account created to verify the verification-data deletion fix.",
        video_path: videoPath,
      });
      if (verificationError) {
        await admin.storage.from("verification-videos").remove([videoPath]);
        await admin.auth.admin.deleteUser(created.user.id);
        throw verificationError;
      }
    }

    return new Response(JSON.stringify({ success: true, email, profile_id: created.user.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
