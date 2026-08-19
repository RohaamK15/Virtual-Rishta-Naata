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

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// Deliberately does NOT import the stripe npm package — just constructing a
// Stripe client from esm.sh's Deno build (stripe@14) crashes this function
// outright on every real invocation with "Deno.core.runMicrotasks() is not
// supported in this environment" (a long-removed internal Deno API that an
// old transitive std@0.177.1 shim inside the SDK still calls), confirmed in
// the function's own logs — nothing to do with which SDK method is called,
// simply importing/constructing it is enough to crash. The event body is
// plain JSON and the signature is standard HMAC-SHA256, so neither actually
// needs the SDK: verified here with Deno's native Web Crypto API instead.
// Tolerance matches Stripe's own SDK default (5 min).
async function verifyStripeSignature(payload: string, sigHeader: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(sigHeader.split(",").map((p) => p.split("=") as [string, string]));
  const timestamp = parts["t"];
  const v1 = parts["v1"];
  if (!timestamp || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const expectedHex = [...new Uint8Array(sigBuffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

  if (expectedHex.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expectedHex.length; i++) diff |= expectedHex.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  if (!signature) {
    return new Response("Webhook signature verification failed: No stripe-signature header value was provided.", { status: 400 });
  }
  const valid = await verifyStripeSignature(body, signature, Deno.env.get("STRIPE_WEBHOOK_SECRET")!);
  if (!valid) {
    return new Response("Webhook signature verification failed.", { status: 400 });
  }

  // deno-lint-ignore no-explicit-any
  let event: any;
  try {
    event = JSON.parse(body);
  } catch (err) {
    return new Response(`Invalid JSON payload: ${err.message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;

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

        // New signups: the account/profile don't exist yet — this is the ONLY
        // place they get created, and only because Stripe just confirmed
        // payment. See create-signup-checkout and pending_signups in schema.sql.
        const pendingSignupId = session.metadata?.pending_signup_id;
        if (pendingSignupId) {
          const { data: pending } = await admin
            .from("pending_signups")
            .select("*")
            .eq("id", pendingSignupId)
            .single();

          // Already processed by an earlier delivery of this same event —
          // Stripe retries webhooks, so this must be a safe no-op.
          if (pending) {
            let userId: string;
            const { data: created, error: createError } = await admin.auth.admin.createUser({
              email: pending.email,
              password: pending.password,
              email_confirm: true,
            });
            if (createError) {
              const { data: existingUsers } = await admin.auth.admin.listUsers();
              const match = existingUsers?.users?.find(
                (u) => u.email?.toLowerCase() === pending.email.toLowerCase()
              );
              if (!match) throw createError;
              userId = match.id;
            } else {
              userId = created.user!.id;
            }

            const profileFields = pending.profile_data as Record<string, unknown>;
            const { error: profileError } = await admin.from("profiles").upsert({
              id: userId,
              ...profileFields,
              contact_email: pending.email,
              plan: pending.plan,
              subscription_status: "active",
              stripe_subscription_id: session.subscription as string,
            });
            if (profileError) throw profileError;

            if (pending.photo_data_url) {
              try {
                const match = pending.photo_data_url.match(/^data:(image\/\w+);base64,(.+)$/);
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
                    console.error("Photo upload failed during signup completion:", uploadError);
                  }
                }
              } catch (photoErr) {
                console.error("Photo upload failed during signup completion:", photoErr);
              }
            }

            await admin.from("pending_signups").delete().eq("id", pendingSignupId);
          }
          break;
        }

        // create-checkout-session: an already-authenticated, already-approved
        // member completing their membership payment — the primary payment
        // path now that approval happens before payment (see account.html's
        // "Complete Your Membership" CTA and submit-profile-for-review).
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
        const sub = event.data.object;
        const status = sub.status === "active" ? "active" : sub.status === "past_due" ? "past_due" : "cancelled";
        await admin.from("profiles").update({ subscription_status: status }).eq("stripe_subscription_id", sub.id);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        await admin.from("profiles").update({ subscription_status: "cancelled" }).eq("stripe_subscription_id", sub.id);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        if (invoice.subscription) {
          await admin.from("profiles").update({ subscription_status: "past_due" }).eq("stripe_subscription_id", invoice.subscription);
        }
        break;
      }
    }
    return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(`Webhook handler error: ${err.message}`, { status: 500 });
  }
});
