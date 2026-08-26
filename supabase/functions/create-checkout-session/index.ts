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

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Builds Stripe success/cancel URLs. Both web and native callers get the
// same real website URL (APP_URL) back.
//
// Native used to get a custom URL scheme (myapp://return?...) instead, so the
// external browser tab could hand control back to the app once Stripe
// redirected. That broke in practice: Chrome on Android refuses to launch an
// external app for a navigation that isn't tied to a direct user gesture, and
// Stripe's post-payment redirect fires asynchronously — well after the
// original "Pay" click — so Chrome silently fell back to treating the scheme
// text as a literal (nonexistent) hostname, producing a DNS error instead of
// returning to the app.
//
// A verified Android App Link doesn't have that restriction: the OS
// intercepts navigation to these URLs before Chrome's gesture check ever
// applies, as long as the app declares a matching autoVerify intent-filter
// (see android/app/src/main/AndroidManifest.xml) and the domain serves a
// matching /.well-known/assetlinks.json. That manifest's intent-filter must
// list every successPage/cancelPage this function is ever called with.
function buildReturnUrls(opts: {
  appUrl: string;
  successPage: string;
  cancelPage: string;
  successParams: Record<string, string>;
  cancelParams: Record<string, string>;
}) {
  const { appUrl, successPage, cancelPage, successParams, cancelParams } = opts;
  const successQuery = new URLSearchParams(successParams).toString();
  const cancelQuery = new URLSearchParams(cancelParams).toString();
  return {
    successUrl: `${appUrl}/${successPage}${successQuery ? `?${successQuery}` : ""}`,
    cancelUrl: `${appUrl}/${cancelPage}${cancelQuery ? `?${cancelQuery}` : ""}`,
  };
}

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

    const { plan, waiverAccepted } = await req.json();
    if (!["monthly", "annual"].includes(plan)) throw new Error("Invalid plan");
    // Consumer Contracts Regulations 2013: a UK consumer buying a digital
    // subscription online normally gets a 14-day cooling-off right to cancel
    // for a refund. That right can be waived, but only if the consumer
    // expressly acknowledges — before paying — that they want immediate
    // access and are giving it up. account.html's checkoutWaiverModal
    // collects that acknowledgement client-side; this check is the real
    // enforcement point, same reasoning as submit-profile-for-review's
    // server-side tosAgreed/religiousDataConsent checks, since a client-side
    // checkbox alone is trivially bypassable.
    if (waiverAccepted !== true) throw new Error("You must acknowledge the cancellation-rights notice before continuing to payment");

    const priceId = plan === "annual"
      ? Deno.env.get("STRIPE_PRICE_ANNUAL")!
      : Deno.env.get("STRIPE_PRICE_MONTHLY")!;

    // stripe_customer_id and contact_email are deliberately excluded from the
    // member-facing SELECT grant (see schema.sql) — the anon+JWT client above
    // can't read them, only identify who's calling. Service-role only past
    // this point, for exactly those two columns.
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: profile } = await admin.from("profiles").select("stripe_customer_id, contact_email, profile_status").eq("id", user.id).single();
    if (profile?.profile_status !== "approved") throw new Error("Your profile must be approved before you can subscribe");

    let customerId = profile?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.contact_email || user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
    }

    const { successUrl, cancelUrl } = buildReturnUrls({
      appUrl: Deno.env.get("APP_URL")!,
      successPage: "account.html",
      cancelPage: "account.html",
      successParams: { membership: "success" },
      cancelParams: { membership: "cancelled" },
    });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { supabase_user_id: user.id, plan },
      // The promo-code entry field on Stripe's hosted Checkout page is opt-in
      // (defaults to hidden) — only shown for the monthly plan, since the
      // first-40-members 40% off coupon is monthly-only. Restricting it here
      // rather than trusting a Stripe-side product restriction, since
      // monthly/annual may be two Prices on the same Product rather than two
      // separate Products, which a coupon's own "limit to product" setting
      // can't tell apart.
      allow_promotion_codes: plan === "monthly",
    });

    // Fire-and-forget: recording the waiver acknowledgement must never block
    // or fail the actual checkout redirect.
    admin.from("profiles").update({ checkout_waiver_accepted_at: new Date().toISOString() }).eq("id", user.id).then(
      () => {},
      (err: unknown) => console.warn("Could not record checkout waiver acceptance:", err),
    );

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
