// Stripe calls this whenever a subscription is created, renewed, or cancelled.
// This is the ONLY place profiles.subscription_status / plan / stripe_subscription_id
// ever change — never trust the client for entitlement state.
//
// After deploying, register this function's URL as a webhook endpoint in the
// Stripe Dashboard (Developers > Webhooks) for these events:
//   checkout.session.completed, customer.subscription.updated,
//   customer.subscription.deleted, invoice.payment_failed
// Then copy the "Signing secret" it gives you into STRIPE_WEBHOOK_SECRET.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature!,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!
    );
  } catch (err) {
    return new Response(`Webhook signature verification failed: ${err.message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.mode === "payment") {
          // The £35 one-to-one consultation — a single payment, not a subscription.
          const requestId = session.metadata?.consultation_request_id;
          if (requestId) {
            await admin.from("consultation_requests").update({
              payment_status: "paid",
            }).eq("id", requestId);
          }
          break;
        }

        const userId = session.client_reference_id || session.metadata?.supabase_user_id;
        const plan = session.metadata?.plan;
        if (userId) {
          await admin.from("profiles").update({
            subscription_status: "active",
            plan: plan || null,
            stripe_subscription_id: session.subscription as string,
          }).eq("id", userId);
        }
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const status = sub.status === "active" ? "active" : sub.status === "past_due" ? "past_due" : "cancelled";
        await admin.from("profiles").update({ subscription_status: status }).eq("stripe_subscription_id", sub.id);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await admin.from("profiles").update({ subscription_status: "cancelled" }).eq("stripe_subscription_id", sub.id);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          await admin.from("profiles").update({ subscription_status: "past_due" }).eq("stripe_subscription_id", invoice.subscription as string);
        }
        break;
      }
    }
    return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(`Webhook handler error: ${err.message}`, { status: 500 });
  }
});
