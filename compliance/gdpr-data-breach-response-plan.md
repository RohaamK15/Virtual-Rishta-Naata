# Personal Data Breach Response Plan

**Status:** Internal document. Not published on the website or in the app.
**Prepared:** 2026-09-03
**Controller:** Virtual Rishta Naata

UK GDPR requires notifying the ICO within 72 hours of becoming aware of a personal data breach likely to result in a risk to individuals' rights and freedoms, and notifying affected individuals directly without undue delay where the risk is high. This plan exists so that clock is never accidentally missed by not having a process at all.

## 1. What counts as a breach here

Any of the following, whether caused externally (attack) or internally (misconfiguration, human error):
- Unauthorised access to the Supabase project (database, storage, or Edge Function secrets)
- A row-level security policy change that exposes data beyond its intended audience (e.g. profiles, messages, or `profile_verification` becoming readable by the wrong role)
- Loss or exposure of the `SUPABASE_SERVICE_ROLE_KEY`, Stripe secret key, or RevenueCat webhook secret
- A member's photo, verification video, or messages becoming accessible via a non-expiring or guessable URL
- Accidental exposure of the `pending_signups` or `profile_verification` tables (special-category data) beyond their designed audience
- A third-party processor (Supabase, Stripe, Apple/RevenueCat, EmailJS, Google/Firebase) notifying us of a breach on their end affecting our data

## 2. Immediate steps on discovery (first hour)

1. **Contain it.** Depending on the cause: rotate the exposed credential/secret immediately (Supabase service role key, Stripe key, RevenueCat webhook secret — all rotatable from their respective dashboards), revert the RLS/policy change that caused exposure, or disable the affected Edge Function.
2. **Preserve evidence.** Note what happened, when it was discovered, and how, before memory of the exact sequence fades — this record is what the 72-hour ICO notification will be built from.
3. **Establish scope.** Which table(s)/bucket(s), how many profiles, what categories of data (ordinary vs. special-category — a `profile_verification` or Pakistan-resident-fields exposure is materially more serious than, say, a `preference_line` exposure), and for how long the exposure existed.

## 3. Assessing notification obligations (within 24 hours of discovery)

- **Is it reportable to the ICO?** Default to yes unless the breach is "unlikely to result in a risk to the rights and freedoms of natural persons" (Article 33(1)) — for a platform whose core data includes special-category (religious) data and, for some members, personal safety-relevant details (e.g. Pakistan-resident members' data is deliberately never collected/shown elsewhere specifically for their safety), the threshold for "unlikely to result in a risk" is high. When in doubt, report.
- **Does it need direct notification to affected members?** Required under Article 34 where the breach is likely to result in a *high* risk (e.g. special-category data, or anything that could plausibly endanger a member — this platform's Pakistan-safety design consideration applies directly here).

## 4. ICO notification (within 72 hours of becoming aware)

Report at [ico.org.uk/for-organisations/report-a-breach](https://ico.org.uk/for-organisations/report-a-breach/), covering:
- Nature of the breach and approximate number of affected individuals/records
- Categories of data involved (flag explicitly if special-category or Pakistan-resident-member data was involved)
- Likely consequences
- Measures taken or proposed to address it and mitigate effects
- Contact point for further information (`contact@virtualrishtanaata.com`)

If full details aren't available within 72 hours, notify with what's known and provide the rest in phases — a late notification for wanting complete information first is treated worse than a prompt, partial one.

## 5. Notifying affected members (without undue delay, where high risk)

Plain-language email to affected members' contact email, describing: what happened, what data was involved, what's being done about it, and what they can do to protect themselves (e.g. "consider changing your password" where relevant). Never use vague corporate language that obscures what actually happened — this platform's whole positioning is built on trust, and a breach notice is exactly the moment that's tested.

## 6. After the immediate response

- Fix the root cause, not just the symptom (e.g. if an RLS policy gap caused it, audit sibling policies for the same class of gap — this project has precedent for that pattern, e.g. the `reply_to_message_id` cross-conversation check added specifically to close a similar-shaped gap before it could be exploited).
- Update this document and the relevant DPIA if the breach reveals a risk this plan didn't anticipate.
- Keep an internal record of every breach (even ones assessed as not reportable) and the reasoning for that assessment — Article 33(5) requires this regardless of whether the ICO was notified.

## 7. Standing contact points

- ICO breach reporting: [ico.org.uk/for-organisations/report-a-breach](https://ico.org.uk/for-organisations/report-a-breach/)
- Supabase support (for platform-side incidents): via the Supabase Dashboard support channel
- Internal contact: `contact@virtualrishtanaata.com`
