// Pulls live revenue figures straight from Stripe for the admin dashboard's
// Revenue tab — nothing here is cached or stored in our own database, so it
// always reflects Stripe's current state at the moment it's requested.
// Admin-only, service-role (uses the Stripe secret key, never exposed to
// the client).
//
// Definitions used (Stripe's own dashboard uses the same two, without a
// single canonical spec for "net" — this is our chosen, explicit meaning):
//   Gross Volume  = total of all successful charges this calendar month.
//   Net Volume    = Gross Volume minus refunds and Stripe's processing fees
//                   this calendar month (i.e. what actually lands in the
//                   bank), computed from each balance transaction's own
//                   `net` field so refunds/fees/disputes are all accounted
//                   for automatically.
//   MRR           = Monthly Recurring Revenue: every currently-active
//                   subscription's price, normalized to a monthly amount
//                   (annual plans divided by 12), summed. A snapshot of the
//                   current recurring run-rate, not tied to any period.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });

function monthlyAmount(price: Stripe.Price, quantity: number): number {
  const unit = (price.unit_amount || 0) * quantity;
  const interval = price.recurring?.interval;
  const intervalCount = price.recurring?.interval_count || 1;
  if (interval === "year") return unit / (12 * intervalCount);
  if (interval === "week") return (unit * 4.348) / intervalCount;
  if (interval === "day") return (unit * 30.437) / intervalCount;
  return unit / intervalCount; // month
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    await requireAdmin(req);

    const now = new Date();
    const startOfMonth = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);

    let grossVolume = 0;
    let netVolume = 0;
    let startingAfter: string | undefined;
    while (true) {
      const page = await stripe.balanceTransactions.list({
        limit: 100,
        created: { gte: startOfMonth },
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      for (const bt of page.data) {
        if (bt.type === "charge") grossVolume += bt.amount;
        netVolume += bt.net;
      }
      if (!page.has_more) break;
      startingAfter = page.data[page.data.length - 1].id;
    }

    let mrr = 0;
    let subStartingAfter: string | undefined;
    while (true) {
      const page = await stripe.subscriptions.list({
        status: "active",
        limit: 100,
        expand: ["data.items.data.price"],
        ...(subStartingAfter ? { starting_after: subStartingAfter } : {}),
      });
      for (const sub of page.data) {
        for (const item of sub.items.data) {
          mrr += monthlyAmount(item.price, item.quantity || 1);
        }
      }
      if (!page.has_more) break;
      subStartingAfter = page.data[page.data.length - 1].id;
    }

    return new Response(JSON.stringify({
      currency: "gbp",
      periodLabel: now.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
      grossVolume: grossVolume / 100,
      netVolume: netVolume / 100,
      mrr: mrr / 100,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.message === "Admin access required" ? 403 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
