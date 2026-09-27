# App Development Lessons — iOS / Apple App Store

App Store Connect and App Review-specific lessons. Read alongside `general.md`.

## Build numbers are a one-way ratchet, permanently

Same rule as Android's `versionCode`: once a build is successfully uploaded to App Store Connect, its build number is spent — including for a build that's later rejected, or one you decide not to submit. The next build needs a strictly higher number. If a submission gets rejected and you need to fix something, you generally do **not** need a new build number just to resubmit metadata/screenshots (those can be edited against the existing build) — but if you rebuild the binary at all, bump the number.

## Metadata is reviewed as strictly as the binary — including screenshots

Guideline 1.1 (Objectionable Content) and its sub-points are commonly enforced against **App Store Connect metadata** — the Description, Promotional Text, Keywords fields, and screenshots/previews — not just what's inside the running app. A few specific traps:

- **1.1.5** specifically flags inflammatory religious commentary and scripture/text quotations. Identifying your audience ("built for [some community]") is fine and neutral; asserting or quoting doctrinal claims is what gets flagged. This distinction — audience descriptor vs. doctrinal claim — is the actual line reviewers draw.
- **Screenshots are a commonly overlooked violation vector.** They're static images uploaded once and don't auto-update when you fix the live app/website content they were captured from. If a rejection cites metadata, check your screenshots as carefully as your text fields — a banner or claim visible in an old screenshot is a first-class, independent violation source.
- Metadata must also stay appropriate for a general/4+ audience regardless of your app's actual age rating.

## A rejected-then-resubmitted app is on a reviewer's radar

Apple's own rejection language sometimes explicitly warns that repeated or unresolved issues escalate to "Extended Review" and, in egregious/repeated cases, developer account-level consequences. Practical implications:

- **Thoroughness beats speed** on the resubmission. Fix everything you can reasonably identify in one pass rather than fixing only the literal cited issue and hoping nothing else gets flagged next time.
- **Don't volunteer defenses against guidelines that weren't cited.** Adding unprompted reassurance in your Notes for Review about a *different* guideline than the one actually flagged can draw a reviewer's attention to a concern they weren't otherwise focused on. Only address what was actually raised, plus factual context that helps them test the app (see demo accounts below).
- **Going back and forth with Apple's Resolution Center to ask for more specifics rarely produces a materially more actionable answer**, and costs real time — especially costly if you have a limited-duration expedited review grant in play. If the rejection already names a specific guideline and area (metadata, a specific behavior), that's usually as actionable as it's going to get; fix and resubmit rather than requesting clarification.
- **"Other apps have more extreme content and weren't rejected" is real, common, and not a usable argument.** App Review does not treat other apps' approval as precedent, and raising it can read as arguing with the reviewer. Category and framing genuinely change scrutiny level (an app whose whole purpose is a certain content type is judged differently than one where similar content appears incidentally) — plan around your own category, not comparisons.

## Expedited review is a limited, semi-discretionary resource

You can request expedited review (via App Store Connect's Resolution Center / Contact Us flow) if a submission is stuck in an unusually long queue, or for a critical fix. It's not unlimited — use it deliberately, and once granted, don't spend the time it buys you on low-value back-and-forth (see above); get a clean, thorough resubmission in rather than a quick partial one.

## Reviewer/demo accounts need to actually demonstrate the app

If your app gates real functionality behind a multi-step process (admin approval, payment, identity verification, etc.), the account you provide to Apple's reviewer in App Review Information **must already be past every gate** — approved, paid/comped, fully active. If it isn't, the reviewer hits the same wall a brand-new real user would (a "pending" or "please subscribe" screen) and literally cannot evaluate your core functionality. This produces a rejection that can look content-related but is actually just "we couldn't see the app work" — a completely avoidable, independent failure mode from any actual content issue. Double check this specifically after any change to your approval/subscription logic, since it's easy to accidentally reset a demo account's special status.

## In-app purchase exclusivity (Guideline 3.1.1) is absolute on iOS

If your app unlocks digital content or a subscription, the purchase must go through Apple's In-App Purchase (StoreKit) — and critically, this is enforced by **whether any path to an alternative payment method is reachable from within the iOS binary at all**, not by whether IAP is also offered. A web checkout link, a Stripe flow, anything that could let a user pay outside Apple's system for the same content, visible anywhere in the iOS build, is typically an automatic rejection with no partial credit for "we also offer IAP." Two practical implications:
- If you support multiple platforms with different payment backends (e.g., Stripe on web/Android, StoreKit on iOS), you need actual platform detection in the code, not just a policy decision — verify at runtime that the iOS build genuinely cannot render or navigate to the non-IAP payment flow, including via any shared web view or account-management screen.
- A **Restore Purchases** affordance is required for IAP-selling apps, and should be reachable whenever the user's membership isn't currently fully active (e.g. right after a reinstall, before the client has re-synced with an existing subscription) — this is its own, separately-checked requirement.

## General App Store Connect hygiene

- Keep the age rating honest and appropriate for your actual content (messaging/UGC features generally push this to at least a moderate rating) — under-rating is itself a distinct rejection risk (2.3.x, "Accurate Metadata"), unrelated to the content-review guidelines above.
- Category selection affects review scrutiny (see "other apps" point above) — pick deliberately, not just for discoverability.
- Push notification opt-in/consent and account-deletion-from-within-the-app are both independently checked (Guideline 5.1.1 area) — confirm both exist and actually work before submitting, not just that they're planned.
