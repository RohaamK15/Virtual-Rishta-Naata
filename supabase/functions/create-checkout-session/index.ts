// Creates a Stripe Checkout Session for the £10/mo or £100/yr plan and returns
// its hosted URL. Card details are entered on Stripe's own page — this
// function (and the rest of our stack) never sees or stores them.
//
// Requires these secrets set on the Supabase project (Project Settings > Edge
// Functions > Secrets, or `supabase secrets set`):
//   STRIPE_SECRET_KEY
//   STRIPE_PRICE_MONTHLY   (Stripe Price ID for the £10/month plan)
//   STRIPE_PRICE_ANNUAL    (Stripe Price ID for the £100/year plan)
//   APP_URL                (e.g. https://virtualrishtanaata.com or your Capacitor app's web origin)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";
import { corsHeaders } from "../_shared/cors.ts";
import { buildReturnUrls } from "../_shared/checkoutUrls.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    // Client authenticated as the calling user (RLS applies) — used only to
    // identify who they are and read their own row.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("Not authenticated");

    const { plan } = await req.json();
    if (!["monthly", "annual"].includes(plan)) throw new Error("Invalid plan");

    const priceId = plan === "annual"
      ? Deno.env.get("STRIPE_PRICE_ANNUAL")!
      : Deno.env.get("STRIPE_PRICE_MONTHLY")!;

    const { data: profile } = await supabase.from("profiles").select("stripe_customer_id, contact_email").eq("id", user.id).single();

    let customerId = profile?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.contact_email || user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      // Service-role client only for the one column a member can't write themselves.
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
    }

    const { successUrl, cancelUrl } = buildReturnUrls({
      appUrl: Deno.env.get("APP_URL")!,
      successPage: "signup.html",
      cancelPage: "signup.html",
      successParams: { checkout: "success" },
      cancelParams: { checkout: "cancelled" },
    });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { supabase_user_id: user.id, plan },
    });

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
