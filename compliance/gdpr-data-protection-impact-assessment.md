# Data Protection Impact Assessment — Ahmadi Verification Processing

**Status:** Internal document. Not published on the website or in the app.
**Prepared:** 2026-09-03
**Controller:** Virtual Rishta Naata
**Scope:** The Ahmadi Verification step of signup (`profile_verification` table, `verification-videos` storage bucket) — the platform's only processing of UK GDPR Article 9 "special category" data (religious belief).

## Why a DPIA is being done

Article 35(3)(b) calls for a DPIA where there is "processing on a large scale of special categories of data referred to in Article 9(1)." Confirming Ahmadi Muslim community involvement is not incidental here — it is the verification step every non-comped signup goes through, so special-category data is processed for substantially all members. Doing this assessment now, rather than waiting until volume makes the "large scale" question unambiguous, is the more defensible position.

## 1. Description of the processing

**What is collected** (`profile_verification`, one row per profile, `schema.sql`): Local Jamaat, Local Sadr's name and contact details, positions held, when the member joined the Jamaat, a description of their Jamaat activity, and a short self-introduction video (face and voice) stored in the `verification-videos` bucket.

**Why**: to let an admin judge genuine Ahmadi community involvement before a profile is approved — this is the mechanism that makes "verified Ahmadi community" a meaningful claim on the platform rather than a self-declaration, and is central to what members are paying for.

**Lawful basis**: explicit consent (Article 9(2)(a)), collected via a dedicated, non-pre-ticked checkbox during signup (`signup.html`'s `religiousDataConsent`), separate from the general Terms/Privacy checkbox. A member who declines cannot proceed past that step, except via the honour-system "Verified by Admin" bypass (below).

**Who sees it**: only an admin, during that one review — for Lajna (women) members, only a Lajna admin (`admin.html`'s `verificationBlock()`). Never shown to other members, before or after approval. Never included in any export, search index, or analytics.

**Retention — the core control this DPIA turns on**: `profile_verification` is designed as one-time-viewing data. `admin-review-profile` deletes the video from storage and the row itself the instant an approve/reject decision is made (`supabase/functions/admin-review-profile/index.ts`), regardless of outcome. No other code path reads or writes this table. This is also what `terms.html` and `privacy.html` promise members in writing.

**The "Verified by Admin" bypass**: a member can self-declare prior verification (with a mandatory on-screen disclaimer) and skip this collection entirely, at the cost of the claim being weaker (self-declared, not admin-checked) — see `verified_by_admin` on `profiles`. This is a genuine minimization option, not just a UX convenience: fewer people go through the special-category collection at all.

## 2. Necessity and proportionality

- Only Ahmadi-identifying members go through this step at all (`isAhmadi === 'Yes'` in signup); it's not collected from every signup regardless of relevance.
- The fields collected (Jamaat, Sadr contact, positions, activity) are the minimum an admin needs to sanity-check community involvement — no fields beyond that are asked for.
- The video is capped (30 seconds, per `signup.html`'s field hint) and single-purpose (identity/community check, not a profile feature — it's never shown to other members).
- Immediate deletion post-decision is itself a proportionality control: this isn't retained "just in case," it exists only for the seconds/minutes between submission and an admin's decision.

**Conclusion**: the processing is necessary for the verification claim to mean anything, and is scoped and time-limited about as tightly as this kind of check can be. The main residual risk is not the *design* of the retention control but whether it *reliably executes* — see below.

## 3. Risk assessment

| Risk | Likelihood / Impact | Mitigation |
|---|---|---|
| Verification data (incl. video) not actually deleted after a decision, contradicting the retention promise and extending exposure of special-category + biometric-adjacent data | **RESOLVED 2026-09-03.** Occurred once (profile VRN-4499, reported 2026-08-24) — see `project_verification_retention_bug` memory. Confirmed via a fresh test profile (approved through the live `admin-review-profile`) that the `profile_verification` row is now correctly deleted: zero rows on direct query, and the admin dashboard no longer shows the verification block. This confirms VRN-4499 was a stale-deployment artifact from before the current deletion logic went live, not an ongoing defect. | No further action required for this risk. Remaining housekeeping only: delete VRN-4499's leftover row and the test profile's data, whenever convenient. |
| Video (face + voice) exposed if the storage bucket's access policy is misconfigured | Low likelihood, high impact | `verification-videos` bucket access is scoped to admin/service-role only, same RLS-backed pattern as `profile-photos`; no public bucket policy exists for it. Re-verify this policy whenever storage RLS is touched. |
| A member is unclear that this data is special-category and consent is genuinely separable from general ToS acceptance | Low — already mitigated | `signup.html` uses a dedicated, non-default-checked checkbox with explicit religious-data wording, validated separately from the ToS/Privacy checkbox before the step can be completed. |
| Over-collection via the honour-system bypass being under-used, forcing more members through full collection than necessary | Low | Bypass is available and disclosed at signup and in edit-profile; take-up isn't something this document can mandate, but the option genuinely reduces volume where used. |

## 4. Consultation

No separate Data Protection Officer is currently appointed. Under Article 37(1)(c), a DPO is mandatory where an organisation's *core activities* involve large-scale processing of special-category data. This has been considered and the current position is: given the platform's present size, formally appointing a DPO is not yet treated as mandatory, but this is the specific trigger to watch — this assessment should be revisited (and a DPO appointment reconsidered) as membership grows, and in any case reviewed annually or whenever this processing changes materially.

## 5. Outcome

Processing may continue. The design (consent, minimization, immediate deletion, restricted visibility) is sound, and the one open item — confirming the deletion control actually executes reliably in production, not just in source — was verified on 2026-09-03 with a live test approval. Clean bill of health as of this date. Revisit this document if the verification flow changes materially, and per §4 as membership grows enough to make the DPO question live again.
