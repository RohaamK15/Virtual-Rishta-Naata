# App Development Lessons — Android / Google Play

Android- and Play Store-specific lessons. Read alongside `general.md`.

## versionCode is a one-way ratchet, permanently

`versionCode` must strictly increase for every `.aab`/`.apk` you actually **upload** to Play Console — including to a release you later discard, cancel, or never actually roll out. Once Play Console has accepted an upload with a given `versionCode`, that number is spent forever, even if the release itself was deleted before publishing.

- Bumping the version in your build config locally means nothing to Play Console until you actually upload. Track the real last-uploaded number as the source of truth, not just what's in your repo.
- If a release gets discarded before rollout, the next build still needs a **new, higher** `versionCode` — don't try to reuse the discarded one.

## You must build your own "force update" mechanism

Google Play does not guarantee users are on your latest version. Staged rollouts, users with auto-update off, and simple lag mean a meaningful fraction of your install base can be running an old build indefinitely.

- Implement a minimum-supported-build check server-side, queried on launch, blocking with an update prompt if the installed build is below the bar (see `general.md` for the full pattern — fail-open on any error, never fail-closed).
- Only raise the bar once the new build is confirmed live and installable — raising it first strands users with nothing to update to.
- There is generally no reliable way to see a specific installed user's build number unless you explicitly have the app report it back to your backend (most simple setups don't) — so a "please update" push notification to your whole user base is usually a broadcast, not a targeted nudge. That's fine; it's harmless for users already up to date.

## Android WebView has real memory constraints for image decoding

If your app is a WebView-based hybrid app, be aware the system WebView (used by Capacitor/Cordova-style apps) has historically had **tighter decode memory limits** than a full desktop or even mobile Chrome browser tab. A high-resolution photo (very achievable with modern Android camera sensors — 50–200MP is common) that decodes fine in a browser can fail with a generic decode error inside the app specifically.

- Don't assume "it works in Chrome on my Android phone" proves it'll work inside your WebView-based app — test the actual app build, on a real (ideally mid-range, not flagship) device, with a genuinely large photo from that device's own camera.
- See `general.md`'s image-handling section for the `createImageBitmap`-with-resize-hint fix — it's the same fix, just extra load-bearing here because of the tighter memory ceiling.

## Camera format defaults vary by manufacturer

Don't assume all Android photos are JPEG. Some manufacturers (Samsung notably) expose a camera setting for HEIF output, which — like iPhone HEIC — most browsers and WebViews can't decode via `<img>`. If you support photo upload, detect and convert HEIC/HEIF regardless of platform; it's not an iOS-only concern.

## Emoji rendering is not guaranteed to look like an icon

Flag emoji, and to a lesser extent other emoji, can render as **plain text glyphs** (the underlying code, visible as letters) instead of a graphic, depending on the device's installed emoji font — this varies by manufacturer/OEM skin and Android version, not just by "old vs new" device. If an icon needs to look consistent across your whole user base, use an actual image asset (SVG/PNG, self-hosted or from a stable CDN) instead of relying on emoji rendering, especially for anything beyond very common, well-supported emoji.

## Push notifications (FCM) can't reach users who predate the mechanism

If you build a new "check for updates" or similar mechanism into a later app version, users on an **older build that predates that mechanism entirely** have no way to discover it exists just by having it added — the old code simply doesn't know to look. Push notification remains the one channel that can reach an already-installed old build regardless of what it does or doesn't know how to check, which is why it's worth keeping as a manual "nudge everyone" lever even after you've built a proper automatic version-check system.

## General Play Store submission hygiene

- Keep a single source of truth for what's actually live vs. what's built-but-not-uploaded vs. uploaded-but-not-rolled-out — these are three different states and it's easy to conflate them mid-project.
- A discarded/cancelled release still "uses up" its versionCode (see above) — so don't discard releases casually if you're not sure yet; prefer holding a release in draft until you're confident, since undoing an upload doesn't undo the version consumption.
