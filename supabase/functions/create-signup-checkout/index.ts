// Starts the paid-signup flow WITHOUT creating an auth account or profile row
// yet. Everything the wizard collected is staged in pending_signups; the
// account only gets created by stripe-webhook once Stripe confirms payment.
// This is what stops someone from browsing (or even just having a "pending"
// account sitting in the database) without ever having paid.
//
// Requires the same secrets as create-checkout-session, plus none new.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";
import { corsHeaders } from "../_shared/cors.ts";
import { buildReturnUrls } from "../_shared/checkoutUrls.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { email, password, profileData, photoDataUrl, plan, native } = await req.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("A valid email is required");
    if (!password || password.length < 8) throw new Error("Password must be at least 8 characters");
    if (!profileData || typeof profileData !== "object") throw new Error("Missing profile data");
    if (!["monthly", "annual"].includes(plan)) throw new Error("Invalid plan");

    const { data: existing } = await admin.auth.admin.listUsers();
    if (existing?.users?.some((u) => u.email?.toLowerCase() === email.toLowerCase())) {
      throw new Error("An account with this email already exists. Please log in instead.");
    }

    const { data: pending, error: insertError } = await admin
      .from("pending_signups")
      .insert({ email, password, profile_data: profileData, photo_data_url: photoDataUrl || null, plan })
      .select("id")
      .single();
    if (insertError) throw insertError;

    const priceId = plan === "annual"
      ? Deno.env.get("STRIPE_PRICE_ANNUAL")!
      : Deno.env.get("STRIPE_PRICE_MONTHLY")!;

    const { successUrl, cancelUrl } = buildReturnUrls({
      native: !!native,
      appUrl: Deno.env.get("APP_URL")!,
      page: "signup.html",
      successParams: { checkout: "success" },
      cancelParams: { checkout: "cancelled" },
    });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { pending_signup_id: pending.id, plan },
    });

    await admin.from("pending_signups")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", pending.id);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
