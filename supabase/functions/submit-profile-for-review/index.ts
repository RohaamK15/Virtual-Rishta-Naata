// Creates the auth account + profile row immediately, before any payment —
// the account starts profile_status/subscription_status at their column
// defaults ('pending'/'pending'), so nothing here grants access on its own.
// An admin must approve the content (admin-review-profile) AND either
// payment (create-checkout-session) or a comp grant (admin-set-comped) must
// follow before is_active_member() ever returns true for this member. See
// supabase/schema.sql's is_active_member() for the actual gate.
//
// Replaces create-signup-checkout's account-creation role for new signups —
// that function and pending_signups are left in place but unused going
// forward (harmless, and still correct for any legacy Stripe session that
// was already in flight when this shipped).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// This insert runs with the service-role key, which bypasses RLS and every
// column-level grant entirely — the only thing standing between a public,
// unauthenticated caller and setting is_admin/subscription_status/
// profile_status/is_comped/etc. directly on their own new row is this
// allowlist. Never spread req.body's profileData into the insert directly.
const ALLOWED_PROFILE_FIELDS = [
  "gender", "age", "height", "qualifications", "employment", "immigration_status",
  "city", "county", "country", "is_ahmadi", "local_jamaat", "had_previous",
  "previous_type", "previous_duration", "has_children", "preference_line",
  "country_looking_in", "consider_pakistan", "additional_note", "about",
];

function pickAllowedFields(profileData: Record<string, unknown>) {
  const picked: Record<string, unknown> = {};
  for (const key of ALLOWED_PROFILE_FIELDS) {
    if (key in profileData) picked[key] = profileData[key];
  }
  return picked;
}

const VERIFICATION_FIELDS = ["local_jamaat", "sadr_name_contact", "positions_held", "joined_jamaat", "jamaat_activity"];

function validateVerification(verification: unknown): Record<string, string> {
  if (!verification || typeof verification !== "object") throw new Error("Ahmadi verification answers are required");
  const v = verification as Record<string, unknown>;
  const picked: Record<string, string> = {};
  for (const key of VERIFICATION_FIELDS) {
    const value = typeof v[key] === "string" ? (v[key] as string).trim() : "";
    if (!value) throw new Error("Please answer every Ahmadi verification question");
    picked[key] = value;
  }
  return picked;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { email, password, profileData, photoDataUrl, plan, verification } = await req.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("A valid email is required");
    if (!password || password.length < 8) throw new Error("Password must be at least 8 characters");
    if (!profileData || typeof profileData !== "object") throw new Error("Missing profile data");
    if (!["monthly", "annual"].includes(plan)) throw new Error("Invalid plan");
    const verificationFields = validateVerification(verification);

    const { data: existing } = await admin.auth.admin.listUsers();
    if (existing?.users?.some((u) => u.email?.toLowerCase() === email.toLowerCase())) {
      throw new Error("An account with this email already exists. Please log in instead.");
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError) throw createError;
    const userId = created.user!.id;

    try {
      const { error: profileError } = await admin.from("profiles").insert({
        id: userId,
        ...pickAllowedFields(profileData),
        contact_email: email,
        plan,
      });
      if (profileError) throw profileError;

      const { error: verificationError } = await admin.from("profile_verification").insert({
        profile_id: userId,
        ...verificationFields,
      });
      if (verificationError) throw verificationError;

      if (photoDataUrl) {
        const match = photoDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
        if (match) {
          const contentType = match[1];
          const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
          const ext = contentType === "image/png" ? "png" : "jpg";
          const path = `${userId}/photo.${ext}`;
          const { error: uploadError } = await admin.storage
            .from("profile-photos")
            .upload(path, bytes, { contentType, upsert: true });
          if (!uploadError) {
            await admin.from("profiles").update({ has_photo: true, photo_path: path }).eq("id", userId);
          } else {
            console.error("Photo upload failed during signup submission:", uploadError);
          }
        }
      }
    } catch (err) {
      // Never leave an orphaned auth user with no profile behind.
      await admin.auth.admin.deleteUser(userId);
      throw err;
    }

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
