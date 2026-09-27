# App Development Lessons — General

Cross-platform lessons from building and shipping a hybrid (Capacitor-style) mobile app with a web backend. Nothing here is specific to one app — these are patterns and gotchas worth checking on any similar project.

## Hybrid / Capacitor-style apps bundle a static snapshot

If your native app wraps a website via Capacitor (or Cordova, or similar) with **no live `server.url`** configured, the app ships a **static, point-in-time copy** of your web assets, built at compile time. This one fact explains a huge share of "why didn't my fix apply" confusion:

- A change to any HTML/CSS/JS file is **live instantly** for anyone using the actual website in a browser.
- The exact same change reaches **zero** existing app installs until you build a new native bundle, upload it to the store, and the user actually updates.
- There is no in-between. "I pushed the fix" and "the app now has the fix" are two different, sequential events with a real gap (store review time + user update time) between them.

**Practical checklist before saying "this is fixed" to a user on the app:**
1. Is this a web-only page/asset, or does it affect what's bundled into the app? (If unsure, check the build config's asset directory / webDir.)
2. If it affects the app, has a new native build actually been produced from the current code?
3. Has that build actually been uploaded and made available on the relevant store?
4. Has the specific user actually updated?

Don't assume "yes" to any of these — verify, or say clearly that you can't verify from where you're sitting.

## Force-update / minimum-version gates are your own responsibility

Neither app store guarantees that users update promptly. Staged rollouts, users with auto-update disabled, and simple inertia mean **old bundled code can persist indefinitely** unless you build your own mechanism to stop it.

A minimal, robust pattern:
- A tiny server-side table: `platform` → `minimum_required_build_number`.
- On app launch (native platforms only — this must be a complete no-op on the website/desktop), the app calls its own build number, compares against that minimum, and if it's below the bar, shows a **blocking** "please update" screen with a button that opens the app's store listing.
- **Fail open, never fail closed**: if the network call fails, if the config row doesn't exist yet, if the app can't determine its own build number — do NOT block the user. A false lockout because of a transient error is far worse than temporarily missing an enforcement window.
- Don't bump the minimum-required version casually. Every bump instantly locks out every user below it, with no fallback except updating. Reserve it for changes that are actually load-bearing (a real bug fix, a compliance issue, a broken flow) — not routine polish.
- **Sequencing matters**: only raise the minimum-required build number *after* confirming the new build is actually live and installable on the store. If you raise the bar before the new version is available, you lock users out with nowhere to go.

## Version/build numbers are a one-way ratchet

Both major app stores treat version/build numbers as **permanently consumed** once uploaded — including a build you later discard, reject, or never actually publish. You cannot reuse a number just because the release using it never went live.

- Always know the actual last-uploaded number, not just what's in your local build config — they can drift apart (e.g., a discarded release, a build made on a different machine, a manual dashboard edit).
- When in doubt, bump forward rather than trying to reuse a "wasted" number — it's not actually free to retry, and guessing wrong wastes a full upload/processing cycle.

## Image handling: don't trust file size as a proxy for "safe to decode"

A file's byte size and its decoded memory footprint are only loosely related. A modern phone camera (50–200MP sensors are now common, especially on Android) can produce a file that's small in megabytes but enormous in pixel count once decoded — that's a `width × height × 4 bytes` bitmap in memory, easily 100s of MB for a single photo.

- **Symptom**: a completely valid, uncorrupted image fails to load in a `<img>`/`Image()` element with a generic decode error, but opens fine in every other viewer. This is very often a decode-memory ceiling being hit inside a constrained rendering context (mobile WebView, especially on a mid-range device), not an actual problem with the file.
- **Fix**: don't decode at full native resolution just to inspect dimensions or produce a thumbnail. Use `createImageBitmap(file, { resizeWidth, resizeQuality })` (or your platform's equivalent) to request a **bounded, downsampled decode directly** — real image decoders (JPEG in particular) can decode-while-downsampling using the format's own multi-scale structure, at a fraction of the memory a full decode would need. Fall back to the naive full-decode approach only if the efficient API isn't available at all.
- If you need the image's true aspect ratio, note that a proportionally-downsampled decode preserves it exactly — you never need the full-resolution pixels just to compute `width / height`.
- Any generic "could not read this file" error message is a trap for future debugging: it collapses several genuinely different failure modes (corrupt file, unsupported format, decode-memory ceiling, incomplete/placeholder file from a cloud-synced source not yet downloaded) into one message. When a user reports this, ask what kind of file/device produced it before assuming the file itself is bad.

## Unusual-but-valid photo formats will reach you

Camera defaults vary by device and are outside your control:
- iPhones default to HEIC/HEIF.
- Many Android phones (Samsung in particular) have a camera setting for HEIF output too.
- Most browsers **cannot decode HEIC/HEIF via a plain `<img>` element at all** — only Safari has native support.

If you accept photo uploads from phones, detect this by file extension and MIME type (`.heic`/`.heif`, `image/heic`/`image/heif` — note the reported MIME type is often empty or wrong, so check the extension too) and convert client-side (a WASM-based library is the practical option in-browser) **before** any validation or preview step runs. Don't just show an error telling the user to convert it themselves — most people don't know their phone even used a non-JPEG format, let alone how to convert it. If conversion itself fails, that's the moment for a clear, actionable fallback message (e.g., "re-export as JPEG from your Photos app, or send it via email/messaging, which usually converts it automatically").

## Text heuristics: naive punctuation splitting breaks on abbreviations

Splitting free text into "sentences" using every `.`/`!`/`?` as a boundary breaks on any abbreviation containing a period (degree abbreviations, initials, etc.) — you get fragments like `"...my B."` as a fake standalone sentence. A more robust rule: only treat punctuation as a sentence boundary when it's followed by whitespace **and then a capital letter**. Not perfect (an abbreviation followed by a capitalized word right after will still misfire occasionally), but a large practical improvement over naive splitting, with no dependency needed.

## Positive matching beats negative filtering for "pick the sentence that means X"

When building a heuristic to select text that has some property (describes personality, is the "important" part, etc.), it's tempting to write it as an **exclusion filter**: skip anything that matches known "not X" patterns, keep whatever's left. This reliably lets through **neutral-but-true statements** that pass every exclusion check without actually having the property you wanted (a sentence can easily be "not about age," "not about a job title," and still say nothing about personality/character).

The fix is to add an actual **positive signal** — a list of words/phrases that genuinely indicate the property you're looking for — and prefer a match against that over just "didn't get excluded." Keep the exclusion-only fallback for when nothing positively matches, so you don't end up with no result at all. This is still a heuristic (not true understanding) and will have edge cases a keyword list can't cover — say so plainly if a user pushes past that limit, rather than continuing to patch an unbounded exclusion list.

## Structure-in-a-string beats a schema migration for incremental nuance

When an existing free-text field needs a bit more structure (a status + a detail, e.g. "employment status" plus "what/looking for what"), consider composing the richer input into a **single, still-human-readable string** stored in the existing column (`"Employed, Software Engineer"`, `"Looking for work, Marketing roles"`) rather than adding new columns.

Trade-off: it's a compromise, not "proper" normalization. But it means:
- Zero schema migration risk.
- Every existing display location keeps working unchanged (they were already just rendering the string).
- You only need new UI (a dropdown + conditional field) and a compose/parse pair of functions — much smaller, safer surface area than threading a new field through every read/write path.

If you do this, write the reverse-parser defensively: real-world existing data will contain values your new UI never would have produced (typos, old free-text entries, literal "N/A"-style shorthand). Map known shorthand to your new categories where you reasonably can, and have a sane default (usually: treat unrecognized text as the "detail" of your most common category) rather than silently discarding it.

## Removing a step from a flow means auditing every downstream reference

Deleting a step (a form page, a choice, a field) from a multi-step flow is never just deleting the HTML for that step. Check for:
- Validation logic that referenced the removed step's fields.
- Confirmation/success copy that described what happens next, assuming the removed step ran.
- Hardcoded step-count labels ("Step 3 of 8") that need updating everywhere, including the un-rendered initial state before any JS runs.
- Other pages linking into the flow with a query parameter meant to pre-fill the now-removed step.
- Any function that becomes dead code as a result — either remove it or leave a clear comment explaining why it's still there.

A partial removal is often worse than not removing it at all: it leaves confident, specific, wrong copy in front of users (e.g., a success message that unconditionally describes a step that no longer applies to most people).

## Feature flags for reversible business decisions

For a change that's explicitly temporary or experimental (an automated email that's redundant during a promo period, a UI variant being tested), prefer a single, clearly-commented boolean/constant over deleting or heavily restructuring the code. State in the comment: why it's off, what condition should trigger turning it back on, and what exactly gets skipped. This makes "turn it back on" a one-line, low-risk change for a future session (yours or someone else's) instead of a re-implementation.

## Automated state vs. manually-set state need separate provenance

If a background process and a human admin can both cause the same field to have the same value (e.g., both can set "comped" / "free access" true), and you ever need to **bulk-undo the automated cases** without touching the manual ones, you need a second field recording *why* the value was set, not just what it is. Design this in from the start of any "system can also just set this" feature — retrofitting provenance after the fact means auditing every historical row to guess which category each one belongs to.

## Counting is not the same privacy problem as reading

If you need usage/engagement analytics (how many conversations, how many messages, how many of X happened), a `COUNT(*)` query answers it without ever touching content, sender identity, or any specific record. This is a meaningfully different — and much safer — operation than a query that reads actual content for moderation purposes, even though both technically "query the same table." When designing an admin/analytics feature, make sure the implementation actually matches the "we're not reading anything private" claim (i.e., don't accidentally `select('*')` when you only need a count).

## UI copy needs multiple real-content passes, not one

A "make it a quick, readable summary" style request routinely takes 2–4 rounds of showing the actual rendered result with real (or realistic) content before it's right — a design that looks reasonable in the abstract often reads badly once real, variable-length, occasionally-awkward user-generated text is dropped into it. Don't treat the first attempt as done; screenshot it, look at it with genuinely messy/edge-case input, and expect to iterate. When a user says an attempt is "worse," the specific reason usually reveals the real constraint (e.g., "truncation always reads as a cut-off fragment, regardless of length" is a different, more useful finding than "make it shorter").

## Store review is inconsistent between apps, and that's not a usable argument

Both major app stores review individual submissions somewhat inconsistently — a more permissive-looking app existing elsewhere on the store is never proof that your content is safe, and pointing it out to a reviewer is not a persuasive argument (stores explicitly do not treat other apps' approval as precedent). Category framing matters more than raw content similarity: an app whose entire purpose is a certain kind of content gets a different scrutiny level than an app where the same content appears incidentally in marketing. Plan content decisions around your own app's category and purpose, not by comparing to other listings.

## Marketing assets are reviewed as strictly as the app itself

Store metadata — description, promotional text, keywords, **and screenshots/preview images** — is reviewed independently of the app binary and is just as capable of triggering a rejection. Screenshots in particular are easy to forget about: they're static images uploaded once, and won't auto-update just because you fixed the live content they were captured from. If a rejection cites "metadata," check the screenshots as carefully as the text fields — a banner or claim visible in a screenshot is a first-class violation source, not just illustrative decoration.
