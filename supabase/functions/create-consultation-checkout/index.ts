// Creates a Stripe Checkout Session for the £35 one-to-one consultation and
// returns its hosted URL. No login required — consultations are open to
// visitors who haven't created a profile yet, same as the booking form itself.
//
// Requires these secrets set on the Supabase project (Project Settings > Edge
// Functions > Secrets, or `supabase secrets set`):
//   STRIPE_SECRET_KEY
//   STRIPE_PRICE_CONSULTATION   (Stripe Price ID for the £35 one-off consultation)
//   APP_URL                     (e.g. https://virtualrishtanaata.com)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";
import { corsHeaders } from "../_shared/cors.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { requestId } = await req.json();
    if (!requestId) throw new Error("Missing requestId");

    // Service-role lookup — consultation_requests has no public select policy,
    // so only this trusted server-side function can read the row back.
    const { data: request, error: fetchError } = await admin
      .from("consultation_requests")
      .select("id, email, payment_status")
      .eq("id", requestId)
      .single();
    if (fetchError || !request) throw new Error("Consultation request not found");
    if (request.payment_status === "paid") throw new Error("This request has already been paid for");

    const appUrl = Deno.env.get("APP_URL")!;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: request.email,
      line_items: [{ price: Deno.env.get("STRIPE_PRICE_CONSULTATION")!, quantity: 1 }],
      success_url: `${appUrl}/services.html?consult=success`,
      cancel_url: `${appUrl}/services.html?consult=cancelled`,
      metadata: { consultation_request_id: request.id },
    });

    await admin.from("consultation_requests")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", request.id);

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
