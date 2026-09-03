// Creates a fully active, approved account without going through Stripe —
// for comp/test accounts (e.g. a paid testing community) that shouldn't be
// charged. Admin-gated like every other admin-* function.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { admin } = await requireAdmin(req);
    const { email, password, gender, age, city, country, about } = await req.json();

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

    const { error: profileError } = await admin.from("profiles").insert({
      id: created.user.id,
      gender,
      age,
      city: city || null,
      country: country || null,
      about: about || "Test account for our closed-testing community.",
      contact_email: email,
      plan: "monthly",
      subscription_status: "active",
      profile_status: "approved",
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id);
      throw profileError;
    }

    return new Response(JSON.stringify({ success: true, email }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
