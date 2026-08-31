// RevenueCat calls this for every subscription lifecycle event on iOS
// (Apple IAP only — Android/web still go entirely through stripe-webhook).
// This is the ONLY place profiles.subscription_status/plan ever change as a
// result of an Apple purchase — never trust the client for entitlement state,
// same reasoning as stripe-webhook.
//
// After deploying, register this function's URL in RevenueCat's dashboard:
// Project Settings > Integrations > Webhooks. Set an "Authorization Header
// value" there and copy the same value into REVENUECAT_WEBHOOK_SECRET below,
// so this endpoint can verify a request actually came from RevenueCat.
//
// Requires the client to call Purchases.logIn({ appUserID: <supabase user id> })
// after signing in — every event below carries that same id back as
// event.app_user_id, which is how this function knows which profile row to
// update (no separate "revenuecat customer id" column needed, unlike Stripe).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function planFromProductId(productId: string | undefined): "monthly" | "annual" | null {
  if (!productId) return null;
  if (productId.endsWith(".monthly")) return "monthly";
  if (productId.endsWith(".annual")) return "annual";
  return null;
}

// Events that grant/renew access vs. ones that end it. CANCELLATION alone is
// deliberately excluded — it only means auto-renew was turned off, the
// member keeps access until the period actually ends (EXPIRATION).
const ACTIVE_EVENTS = new Set([
  "INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE",
  "SUBSCRIPTION_EXTENDED", "TEMPORARY_ENTITLEMENT_GRANT",
]);
const EXPIRED_EVENTS = new Set(["EXPIRATION"]);
const PAST_DUE_EVENTS = new Set(["BILLING_ISSUE"]);

Deno.serve(async (req) => {
  // Strips an optional "Bearer " prefix before comparing — RevenueCat's own
  // docs are ambiguous about whether the configured "Authorization Header
  // value" is sent as-is or wrapped in "Bearer ", and a mismatch on this
  // alone would silently 401 every single webhook regardless of how
  // carefully the secret itself was copied into both dashboards.
  const rawAuth = req.headers.get("Authorization") || "";
  const auth = rawAuth.replace(/^Bearer\s+/i, "");
  const secret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");
  if (!secret || !auth || auth !== secret) {
    console.warn(`revenuecat-webhook auth mismatch — got auth header of length ${rawAuth.length}, secret configured: ${!!secret}`);
    return new Response("Unauthorized", { status: 401 });
  }

  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch (err) {
    return new Response(`Invalid JSON payload: ${err.message}`, { status: 400 });
  }

  try {
    const event = body.event;
    const userId = event?.app_user_id;
    if (!userId) return new Response(JSON.stringify({ received: true, skipped: "no app_user_id" }), { headers: { "Content-Type": "application/json" } });

    if (ACTIVE_EVENTS.has(event.type)) {
      const plan = planFromProductId(event.product_id);
      await admin.from("profiles").update({
        subscription_status: "active",
        ...(plan ? { plan } : {}),
      }).eq("id", userId);
    } else if (EXPIRED_EVENTS.has(event.type)) {
      await admin.from("profiles").update({ subscription_status: "cancelled" }).eq("id", userId);
    } else if (PAST_DUE_EVENTS.has(event.type)) {
      await admin.from("profiles").update({ subscription_status: "past_due" }).eq("id", userId);
    }

    return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(`Webhook handler error: ${err.message}`, { status: 500 });
  }
});
