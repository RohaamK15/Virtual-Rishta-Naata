# Virtual Rishta Naata — Going Live Checklist

The app (front end) is fully built and wired up to call a real Supabase backend.
Everything below is the part only you can do — creating accounts, paying for
things, and installing tools on your own machine. Work through it top to
bottom; each section says exactly what to click/paste.

## 1. Supabase (auth, database, storage)

1. Create a free project at https://supabase.com (needs an email + password, no card).
2. In your project: **SQL Editor > New query**, paste the entire contents of
   `supabase/schema.sql`, and run it. This creates the `profiles` table,
   reference-code generator, all security policies, and the private photo
   storage bucket.
3. **Project Settings > API** — copy the **Project URL** and the **anon public
   key**, and paste them into `assets/js/supabase-config.js`.
4. **Authentication > Providers > Email** — for now, turn **off** "Confirm
   email" so new members can use their account immediately after signup
   (you can turn this back on later once you also build a "check your email"
   step — the signup page already handles that case gracefully if you do).
5. **Authentication > URL Configuration > Redirect URLs** — add
   `https://yourdomain.com/reset-password.html` (and
   `http://localhost:3000/reset-password.html` while testing locally). Without
   this, the "Forgot password?" email link on the login page won't work.
6. Create your own admin account: go through the normal Create Profile flow
   once on the site, then in **SQL Editor** run:
   ```sql
   update public.profiles set is_admin = true where contact_email = 'you@example.com';
   ```
   You (and anyone else with `is_admin = true`) can now sign in and open
   `admin.html`.

## 2. Deploy the Edge Functions

The admin dashboard and payments run through small server-side functions in
`supabase/functions/` (never the browser, so secrets stay secret).

1. Install the Supabase CLI: `npm install -g supabase`
2. `supabase login`
3. `supabase link --project-ref YOUR-PROJECT-REF` (run from this project folder)
4. `supabase functions deploy create-signup-checkout`
   `supabase functions deploy create-checkout-session`
   `supabase functions deploy create-consultation-checkout`
   `supabase functions deploy cancel-subscription`
   `supabase functions deploy delete-own-account`
   `supabase functions deploy stripe-webhook --no-verify-jwt`
   `supabase functions deploy get-profile-photo`
   `supabase functions deploy admin-list-profiles`
   `supabase functions deploy admin-delete-profile`
   `supabase functions deploy admin-list-flagged-messages`
   `supabase functions deploy admin-mark-message-reviewed`
   `supabase functions deploy admin-list-profile-reports`
   `supabase functions deploy admin-mark-report-reviewed`

## 3. Stripe (payments)

1. Create an account at https://stripe.com (needs your business/bank details
   to actually take live payments — test mode works without them).
2. **Product catalog > Add product** — create two recurring prices:
   - "Monthly Membership" — £10.00 / month
   - "Annual Membership" — £100.00 / year
   Copy each **Price ID** (starts `price_...`).
   Also add a one-off price:
   - "One-to-One Consultation" — £35.00, **one time** (not recurring).
   Copy its **Price ID** too.
3. **Developers > API keys** — copy your **Secret key**.
4. In Supabase: **Project Settings > Edge Functions > Secrets**, add:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_PRICE_MONTHLY`
   - `STRIPE_PRICE_ANNUAL`
   - `STRIPE_PRICE_CONSULTATION`
   - `APP_URL` — your site's URL (e.g. `https://virtualrishtanaata.com`, or
     `http://localhost:3000` while testing)
   - `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` — the
     Supabase CLI usually sets these automatically; if not, copy them from
     Project Settings > API.
5. **Developers > Webhooks > Add endpoint** — point it at your deployed
   `stripe-webhook` function's URL (Supabase shows this after step 2 above).
   Subscribe it to: `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.payment_failed`.
   Copy the **Signing secret** it gives you into the `STRIPE_WEBHOOK_SECRET`
   secret in Supabase.
6. Test with Stripe's test card `4242 4242 4242 4242`, any future expiry, any
   CVC, before going live.

## 4. Try it locally

1. `node serve.mjs` (serves the site at http://localhost:3000)
2. Make sure `assets/js/supabase-config.js` has your real URL/key (step 1.3).
3. Create a profile, subscribe, browse, and check the admin dashboard.

## 5. Package for the App Store / Play Store (Capacitor)

The native app shells already exist in `android/` and `ios/`. Whenever you
change any page or asset:

```
node build-www.mjs
npx cap sync
```

**Android:**
1. Install [Android Studio](https://developer.android.com/studio) (this
   machine doesn't have it yet — Capacitor's Android build needs it).
2. `npx cap open android` opens the project in Android Studio.
3. Create a [Google Play Developer account](https://play.google.com/console/signup)
   (one-time $25 fee) to publish.

**iOS:**
1. iOS apps can only be built and submitted from a **Mac** with Xcode
   installed — not possible on this Windows machine. Once you (or a
   collaborator) has a Mac, open `ios/App/App.xcworkspace` in Xcode.
2. You'll need an [Apple Developer account](https://developer.apple.com/programs/)
   ($99/year) to submit to the App Store.

## What's already done vs. what's still a placeholder

**Done:** full UI for all 9 screens, Supabase auth, profile CRUD, live search
with filters, RLS so members can only ever see active members' full profiles,
column-level write protection so a member can never grant themselves admin or
an active subscription, admin dashboard backed by service-role Edge
Functions, Stripe Checkout redirect flow, signed-URL photo access (male
profiles only), Capacitor project scaffolding for both app stores.

**Still needs your input before going live:** the actual Supabase project,
Stripe account + webhook, and (for native builds) Android Studio / a Mac with
Xcode. Everything above tells you exactly where to plug those in.
