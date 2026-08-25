// Shared show/hide toggle for any password field wrapped in a
// .password-field with a .password-toggle button (see styles.css). Used on
// login, signup, and reset-password — kept in one place so all three stay
// in sync instead of drifting copies.
function vrnTogglePasswordVisibility(btn) {
  const input = document.getElementById(btn.dataset.target);
  const isHidden = input.type === "password";
  input.type = isHidden ? "text" : "password";
  btn.querySelector(".eye-open").style.display = isHidden ? "none" : "";
  btn.querySelector(".eye-closed").style.display = isHidden ? "" : "none";
  btn.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
}

// The profile detail view displays photos in a fixed 4:5 portrait frame
// (object-fit:cover) — a landscape or square photo gets cropped down to a
// tiny sliver of itself to fill that shape, which is exactly the "you can
// only see my mouth" problem. Rather than just cropping unpredictably,
// reject the photo at upload time with a clear reason. Returns null if the
// photo's shape is acceptable, otherwise a message to show the member.
function vrnValidatePortraitPhoto(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const ratio = img.naturalWidth / img.naturalHeight; // <1 means taller than wide
      if (ratio >= 0.95) {
        resolve("Please upload a portrait photo (clearly taller than it is wide) — landscape and square photos get cropped awkwardly in the profile frame.");
      } else if (ratio < 0.5) {
        resolve("This photo is too tall and narrow to fit the profile frame well — please choose a more standard portrait photo, like a typical phone photo.");
      } else {
        resolve(null);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve("Could not read this image — please choose a different file.");
    };
    img.src = url;
  });
}

// A phone photo can easily be 4000x6000px while still under the 5MB file-size
// cap — the profile frame never displays anywhere near that size (it's shown
// at most a few hundred px wide), so anything bigger than maxDimension just
// means a slower download and a bigger image for the browser to decode for
// no visual benefit. Silently downscales instead of rejecting the photo —
// nobody should have to fight with external resizing tools. Returns the
// original file unchanged if it's already a reasonable size.
// Ahmadi Verification's self-introduction video: capped at 30s / 50MB (see
// the profile_verification table). Reads duration via a hidden <video>
// element rather than trusting file metadata, same reasoning as the photo
// shape check using a real <img> load rather than trusting file headers.
function vrnValidateIntroVideo(file, maxDurationSeconds = 30, maxBytes = 50 * 1024 * 1024) {
  return new Promise((resolve) => {
    if (file.size > maxBytes) {
      resolve(`This video is too large (max ${Math.round(maxBytes / 1024 / 1024)}MB) — please record a shorter clip or lower quality.`);
      return;
    }
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      if (video.duration > maxDurationSeconds + 1) { // +1s grace for encoder rounding
        resolve(`This video is too long (max ${maxDurationSeconds} seconds) — please trim it or record a shorter one.`);
      } else {
        resolve(null);
      }
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve('Could not read this video — please choose a different file.');
    };
    video.src = url;
  });
}

// Uploads directly to the verification-videos bucket using the caller's own
// authenticated session (RLS scopes them to their own folder — see
// verification_videos_insert_own/update_own in schema.sql). Used by both
// signup.html (right after account creation + sign-in) and edit-profile.html
// (already signed in). Returns the storage path to pass to
// submit-profile-verification, never the video itself.
async function vrnUploadIntroVideo(userId, file){
  const ext = (file.name.match(/\.(\w+)$/)?.[1] || 'mp4').toLowerCase();
  const path = `${userId}/intro.${ext}`;
  // upsert:true (and the plain .update() method) both hit an RLS rejection
  // that a plain insert doesn't, for reasons that don't match the policy
  // text at all - confirmed empirically, not just theorized. Delete-then-
  // insert sidesteps it entirely for the retry/re-edit case, which is the
  // only time this path would already have an object in it.
  await sb.storage.from('verification-videos').remove([path]).catch(() => {});
  const { error } = await sb.storage.from('verification-videos').upload(path, file);
  if (error) throw error;
  return path;
}

function vrnDownscaleImage(file, maxDimension = 1600, quality = 0.85) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { naturalWidth: w, naturalHeight: h } = img;
      if (w <= maxDimension && h <= maxDimension) {
        resolve(file);
        return;
      }
      const scale = maxDimension / Math.max(w, h);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return; } // canvas export failed — fall back to the original
        resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
      }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); }; // let the later size/shape checks catch real problems
    img.src = url;
  });
}

// Dark mode. Applied via a data-theme attribute on <html> (not
// prefers-color-scheme alone) so it can be explicitly toggled regardless of
// OS setting. Signed-out visitors get a first-party cookie, since they have
// no profiles row yet (e.g. mid-signup, pre-payment); signed-in members also
// get it written to profiles.theme_preference so the choice follows them
// across devices — see the cookie-vs-DB fallback in vrnRenderNavAuthState.
// The actual attribute-setting for first paint happens in a tiny inline
// <script> at the top of each page's <head> (this function only re-syncs
// toggle icons afterward), since app.js itself loads too late to avoid a
// flash of the wrong theme.
function vrnApplyTheme(theme) {
  const isDark = theme === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  document.querySelectorAll('.theme-toggle').forEach((btn) => {
    const light = btn.querySelector('.theme-icon-light');
    const dark = btn.querySelector('.theme-icon-dark');
    if (light) light.style.display = isDark ? 'none' : '';
    if (dark) dark.style.display = isDark ? '' : 'none';
  });
  // Keeps the browser's own UI (mobile Chrome's address bar, the task
  // switcher card background) matching the page instead of staying stuck
  // light — the <head> anti-flash script sets this same value before first
  // paint; this just keeps it in sync after a toggle.
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) themeColorMeta.setAttribute('content', isDark ? '#100E0B' : '#FFF9F2');
}

function vrnGetStoredTheme() {
  const match = document.cookie.match(/(?:^|; )vrn_theme=(dark|light)/);
  return match ? match[1] : null;
}

function vrnSetStoredTheme(theme) {
  document.cookie = `vrn_theme=${theme}; path=/; max-age=31536000; samesite=lax`;
}

async function vrnToggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  vrnApplyTheme(next);
  vrnSetStoredTheme(next);
  // Best-effort: silently ignored if signed out, or mid-signup with no
  // profiles row yet — the cookie above already applied the choice either way.
  if (typeof vrnCurrentUser === 'function') {
    try {
      const user = await vrnCurrentUser();
      if (user) await sb.from('profiles').update({ theme_preference: next }).eq('id', user.id);
    } catch (e) { /* not signed in, or column not migrated yet */ }
  }
}

// Shared behaviours: mobile nav toggle, reveal-on-scroll, generic sheet/overlay helpers
document.addEventListener('DOMContentLoaded', () => {
  // The inline anti-flash script in <head> already set data-theme from the
  // cookie before first paint — this just syncs the toggle button icon(s)
  // to match, since the buttons didn't exist yet when that script ran. Every
  // .theme-toggle button already has its own inline onclick="vrnToggleTheme()"
  // — don't also addEventListener here, or a real click fires the toggle
  // twice (once per handler) and cancels itself out.
  vrnApplyTheme(document.documentElement.getAttribute('data-theme') || 'light');

  const toggle = document.querySelector('.nav-toggle');
  const menu = document.querySelector('.mobile-menu');
  const close = document.querySelector('.mobile-menu-close');
  if (toggle && menu) {
    toggle.addEventListener('click', () => menu.classList.add('open'));
  }
  if (close && menu) {
    close.addEventListener('click', () => menu.classList.remove('open'));
  }
  if (menu) {
    menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => menu.classList.remove('open')));
  }

  // scroll reveal for elements with [data-reveal]
  const revealEls = document.querySelectorAll('[data-reveal]');
  if (revealEls.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('reveal');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    revealEls.forEach(el => io.observe(el));
  }

  vrnRenderNavAuthState();
  vrnRegisterForPush();
  vrnInitRevenueCat();
});

// Registers this device for push notifications (new chat messages) — native
// only, and only once a member is signed in. Safe to call on every page load:
// re-registering is a no-op if the token hasn't changed, and Capacitor only
// prompts for permission once (or if it was previously denied, just no-ops).
async function vrnRegisterForPush(){
  if (!window.Capacitor?.isNativePlatform?.()) return;
  const { PushNotifications } = window.Capacitor.Plugins || {};
  if (!PushNotifications) return;
  if (typeof vrnCurrentUser !== 'function') return;

  let user;
  try { user = await vrnCurrentUser(); } catch (e) { return; }
  if (!user) return;

  let permStatus = await PushNotifications.checkPermissions();
  if (permStatus.receive === 'prompt' || permStatus.receive === 'prompt-with-rationale') {
    permStatus = await PushNotifications.requestPermissions();
  }
  if (permStatus.receive !== 'granted') return;

  await PushNotifications.register();

  PushNotifications.addListener('registration', async (token) => {
    try {
      await sb.from('profiles').update({
        push_token: token.value,
        push_platform: window.Capacitor.getPlatform(), // 'android' today; 'ios' once APNs is connected
      }).eq('id', user.id);
    } catch (e) { console.warn('Could not save push token:', e); }
  });
  PushNotifications.addListener('registrationError', (err) => {
    console.warn('Push registration error:', err);
  });

  // Tapping a delivered notification (app backgrounded or closed) — routes
  // to whatever page the sender attached as data.url (see _shared/fcm.ts).
  // Safe to register on every page load: Capacitor delivers this event to
  // whichever page happens to be active when the tap is handled.
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const url = action?.notification?.data?.url;
    if (!url) return;
    // An absolute external URL (e.g. a Play Store link, see
    // admin-send-update-nudge) should open via the system/Play Store app,
    // not load as a webpage inside our own WebView — everywhere else in the
    // app that opens an external URL already goes through Browser.open for
    // the same reason. A relative in-app path (e.g. "/account.html") keeps
    // using direct navigation as before.
    if (/^https?:\/\//.test(url) && window.Capacitor?.Plugins?.Browser) {
      window.Capacitor.Plugins.Browser.open({ url });
    } else {
      window.location.href = url;
    }
  });
}

// Configures RevenueCat for Apple IAP purchases — iOS native only; Android
// and web still go entirely through Stripe (see create-checkout-session).
// Safe to call on every page load: Purchases.configure() is a no-op if
// already configured for the same appUserID. Logging in with the Supabase
// user's own id (rather than letting RevenueCat generate an anonymous one)
// is what lets revenuecat-webhook match a purchase event back to a profile
// row via event.app_user_id, with no extra "revenuecat customer id" column.
async function vrnInitRevenueCat(){
  if (!window.Capacitor?.isNativePlatform?.() || window.Capacitor.getPlatform() !== 'ios') return;
  const { Purchases } = window.Capacitor.Plugins || {};
  if (!Purchases) return;
  if (typeof vrnCurrentUser !== 'function') return;

  let user;
  try { user = await vrnCurrentUser(); } catch (e) { return; }
  if (!user) return;

  try {
    await Purchases.configure({ apiKey: window.REVENUECAT_CONFIG.iosApiKey, appUserID: user.id });
  } catch (e) { console.warn('RevenueCat configure failed:', e); }
}

// Swaps the marketing-page nav's "Log In" / "Create Profile" buttons for the
// member's own avatar + ref code (linking to their account) and a Log Out
// button, when they're already signed in. Guarded so pages that don't load
// the Supabase SDK (nothing calls this before it's available) just no-op —
// DOMContentLoaded fires after every script tag on the page has run, so by
// the time this executes, vrnCurrentUser/sb are defined on any page that
// includes them, regardless of tag order relative to app.js.
async function vrnRenderNavAuthState(){
  if (typeof vrnCurrentUser !== 'function') return;
  let user;
  try { user = await vrnCurrentUser(); } catch (e) { return; }
  if (!user) return;

  let profile = null;
  try { profile = await vrnMyProfile(); } catch (e) {}
  if (!profile) return;

  // A signed-in member's DB-stored theme choice only needs to apply when
  // there's no cookie yet (e.g. first login on a new device/browser) — once
  // set, the cookie is the faster, synchronous source of truth used by the
  // anti-flash <head> script on every subsequent page load.
  if (!vrnGetStoredTheme() && profile.theme_preference) {
    vrnApplyTheme(profile.theme_preference);
    vrnSetStoredTheme(profile.theme_preference);
  }

  let avatarUrl = null;
  if (profile.has_photo && profile.photo_path && profile.photo_status === 'approved') {
    try {
      const { data: signed } = await sb.storage.from('profile-photos').createSignedUrl(profile.photo_path, 300);
      avatarUrl = signed?.signedUrl || null;
    } catch (e) { /* fall back to placeholder icon */ }
  }
  const avatarHtml = avatarUrl
    ? `<img src="${avatarUrl}" alt="" class="nav-user-avatar">`
    : `<span class="nav-user-avatar nav-user-avatar--placeholder"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1"/></svg></span>`;

  // Messages/Admin Console as small round icon buttons (matching the
  // .icon-btn used for the theme toggle elsewhere) rather than labelled
  // buttons or a dropdown — compact enough to sit directly in the header
  // without crowding the brand wordmark or nav-links at any desktop width.
  document.querySelectorAll('.nav-cta').forEach(navCta => {
    const loginLink = navCta.querySelector('a[href="/login.html"]');
    const signupLink = navCta.querySelector('a[href="/signup.html"]');
    if (!loginLink && !signupLink) return;
    loginLink?.remove();
    signupLink?.remove();

    const chip = document.createElement('a');
    chip.href = '/account.html';
    chip.className = 'nav-user-chip';
    chip.innerHTML = avatarHtml + `<span class="nav-user-ref">${profile.ref_code}</span>`;

    const messagesLink = document.createElement('a');
    messagesLink.href = '/messages.html';
    messagesLink.className = 'icon-btn nav-cta-icon';
    messagesLink.setAttribute('aria-label', 'Messages');
    messagesLink.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>';

    const logoutBtn = document.createElement('button');
    logoutBtn.type = 'button';
    logoutBtn.className = 'btn btn-outline btn-sm nav-cta-icon';
    logoutBtn.textContent = 'Log Out';
    logoutBtn.onclick = () => vrnSignOut();

    navCta.insertBefore(logoutBtn, navCta.firstChild);
    if (profile.is_admin) {
      const adminLink = document.createElement('a');
      adminLink.href = '/admin.html';
      adminLink.className = 'icon-btn nav-cta-icon';
      adminLink.setAttribute('aria-label', 'Admin Console');
      adminLink.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>';
      navCta.insertBefore(adminLink, logoutBtn);
    }
    navCta.insertBefore(messagesLink, navCta.firstChild);
    navCta.insertBefore(chip, navCta.firstChild);
  });

  // Mobile menu shows the same links in a simple vertical list — swap them
  // the same way rather than trying to fit the avatar chip in there.
  document.querySelectorAll('.mobile-menu a[href="/login.html"]').forEach(a => {
    a.textContent = 'My Account (' + profile.ref_code + ')';
    a.href = '/account.html';

    const messagesItem = document.createElement('a');
    messagesItem.textContent = 'Messages';
    messagesItem.href = '/messages.html';
    a.insertAdjacentElement('afterend', messagesItem);
  });
  document.querySelectorAll('.mobile-menu a[href="/signup.html"]').forEach(a => {
    if (profile.is_admin) {
      a.textContent = 'Admin Console';
      a.href = '/admin.html';
      a.onclick = null;
      const logoutItem = document.createElement('a');
      logoutItem.textContent = 'Log Out';
      logoutItem.href = '#';
      logoutItem.onclick = (e) => { e.preventDefault(); vrnSignOut(); };
      a.insertAdjacentElement('afterend', logoutItem);
    } else {
      a.textContent = 'Log Out';
      a.href = '#';
      a.onclick = (e) => { e.preventDefault(); vrnSignOut(); };
    }
  });
}

// Android hardware/gesture back button: without this, Capacitor's default
// behaviour exits the app the moment there's no more WebView history, even
// mid-navigation. Go back through our own page history first, and only let
// the app actually close once there's truly nowhere left to go.
if (window.Capacitor?.Plugins?.App) {
  window.Capacitor.Plugins.App.addListener('backButton', () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.Capacitor.Plugins.App.exitApp();
    }
  });
}

// Opens a Stripe Checkout URL. On native builds this uses an external system
// browser tab (Capacitor's Browser plugin) rather than navigating the app's
// own WebView — required so Apple/Google don't treat this as an in-app
// purchase flow, and it also avoids losing sessionStorage state that would
// happen if the WebView navigated away to a different origin.
//
// onCancelled is called if the user backs out of the browser tab without
// completing checkout (e.g. system back button) — without this, the calling
// page's "Redirecting to Stripe..." button stays disabled forever, since the
// only other place it re-enables is the success/cancel deep link, which never
// fires if the browser was just closed rather than redirected. Capacitor's
// 'browserFinished' event fires whenever the tab closes, including on a
// completed checkout, so onCancelled may run there too — harmless, since by
// then appUrlOpen has already navigated the page away.
async function vrnOpenCheckout(url, onCancelled) {
  if (window.Capacitor?.isNativePlatform?.() && window.Capacitor.Plugins?.Browser) {
    if (onCancelled) {
      const handle = await window.Capacitor.Plugins.Browser.addListener('browserFinished', () => {
        handle.remove();
        onCancelled();
      });
    }
    await window.Capacitor.Plugins.Browser.open({ url });
  } else {
    window.location.href = url;
  }
}

// Stripe's success/cancel URLs point back at the real website (see
// supabase/functions/_shared/checkoutUrls.ts). On Android, a verified App
// Link (see android/app/src/main/AndroidManifest.xml and the
// /.well-known/assetlinks.json served from that same domain) intercepts
// navigation to those URLs and routes it here instead of loading them in the
// external browser tab. This just closes that tab and reloads the same
// bundled page with the same query params the website flow already knows
// how to handle.
//
// A custom URL scheme (e.g. myapp://) was tried first, but Chrome on Android
// refuses to hand off to an external app for a navigation that isn't tied to
// a direct user gesture — and Stripe's post-payment redirect fires
// asynchronously, well after the original "Pay" click, so it was always
// getting silently blocked.
if (window.Capacitor?.Plugins?.App) {
  window.Capacitor.Plugins.App.addListener('appUrlOpen', async (data) => {
    try {
      const url = new URL(data.url);
      if (!url.pathname.endsWith('.html')) return;
      if (window.Capacitor.Plugins.Browser) {
        await window.Capacitor.Plugins.Browser.close().catch(() => {});
      }
      window.location.href = url.pathname + url.search;
    } catch (e) {
      console.warn('Could not handle return from checkout:', e);
    }
  });
}

// supabase-js's functions.invoke() only ever sets error.message to a generic
// "Edge Function returned a non-2xx status code" — the actual {error: "..."}
// body every one of our functions returns is left on error.context (a raw
// Response) and has to be read separately. Without this, specific messages
// like "An account with this email already exists" never reach the user;
// they just see the generic wrapper text instead.
async function vrnFunctionErrorMessage(error) {
  if (!error) return 'Something went wrong — please try again.';
  try {
    if (error.context && typeof error.context.json === 'function') {
      const body = await error.context.json();
      if (body?.error) return body.error;
    }
  } catch (e) { /* body wasn't JSON, or already consumed — fall through */ }
  return error.message || 'Something went wrong — please try again.';
}

function openSheet(id) {
  document.getElementById(id)?.classList.add('open');
  document.getElementById(id + '-overlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeSheet(id) {
  document.getElementById(id)?.classList.remove('open');
  document.getElementById(id + '-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
}

// Back-to-top button, injected here rather than duplicated as markup across
// every page — this file already loads everywhere. Appears once the page is
// scrolled down a bit, scrolls smoothly back to the top on click.
(function vrnInitBackToTop() {
  const mount = () => {
    if (document.querySelector('.back-to-top')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'back-to-top';
    btn.setAttribute('aria-label', 'Back to top');
    btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    document.body.appendChild(btn);

    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        btn.classList.toggle('visible', window.scrollY > 480);
        ticking = false;
      });
    }, { passive: true });
  };
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();

// Force-update gate — a native app build already installed on someone's
// phone can't be patched by a web deploy (see the Google sign-in disable
// fix, 2026-08-24), so anything that MUST reach every user immediately
// needs this: block all use of the app until it's updated to at least the
// minimum version we currently require, checked against a small
// admin-controlled table (app_min_version) rather than hardcoded here.
// Runs on every page (this file is loaded everywhere) but is a total no-op
// on the website itself — Capacitor.isNativePlatform() is only ever true
// inside the actual native app wrapper, never a browser, so this can never
// lock out a desktop/mobile-web visitor or the admin dashboard used from a
// normal browser.
(async function vrnEnforceMinAppVersion() {
  try {
    if (!window.Capacitor?.isNativePlatform?.()) return;
    const platform = window.Capacitor.getPlatform();
    if (platform !== 'android' && platform !== 'ios') return;

    const appInfo = await window.Capacitor.Plugins.App.getInfo();
    const currentBuild = parseInt(appInfo.build, 10);
    if (!Number.isFinite(currentBuild)) return; // can't tell -> fail open, never lock someone out on a guess

    // Every page loads this file BEFORE supabase-config.js (see the shared
    // script order across every page) — awaiting the plugin call above only
    // yields a microtask, which isn't a strong enough guarantee that a later
    // <script> tag has actually executed yet. Poll with real macrotask
    // delays (setTimeout) instead, which only fire once the browser has
    // finished running every currently-queued script.
    let cfg = window.SUPABASE_CONFIG;
    for (let waited = 0; !cfg && waited < 5000; waited += 100) {
      await new Promise((r) => setTimeout(r, 100));
      cfg = window.SUPABASE_CONFIG;
    }
    if (!cfg) return;
    const res = await fetch(
      `${cfg.url}/rest/v1/app_min_version?platform=eq.${platform}&select=min_build_number`,
      { headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}` } }
    );
    if (!res.ok) return; // network hiccup -> fail open, never lock someone out over connectivity
    const rows = await res.json();
    const minBuild = rows?.[0]?.min_build_number;
    // No row for this platform yet (e.g. iOS before its first real release)
    // means nothing is enforced there yet — fail open, not closed.
    if (!Number.isFinite(minBuild) || currentBuild >= minBuild) return;

    vrnShowForceUpdateOverlay(platform);
  } catch (e) {
    console.warn('vrnEnforceMinAppVersion failed:', e);
  }
})();

function vrnShowForceUpdateOverlay(platform) {
  if (document.getElementById('vrnForceUpdateOverlay')) return;
  const inject = () => {
    document.documentElement.style.overflow = 'hidden';
    const overlay = document.createElement('div');
    overlay.id = 'vrnForceUpdateOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#FFF9F2;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px;font-family:Lato,sans-serif;';
    overlay.innerHTML = `
      <div style="width:64px;height:64px;border-radius:50%;background:#EFE6D5;display:flex;align-items:center;justify-content:center;margin-bottom:22px;">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#134B35" stroke-width="1.8"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3"/></svg>
      </div>
      <h2 style="font-family:Cinzel,serif;color:#134B35;font-size:1.3rem;margin-bottom:12px;">Update Required</h2>
      <p style="max-width:320px;color:#5c5850;line-height:1.6;margin-bottom:26px;font-size:.92rem;">A newer version of Virtual Rishta Naata is available. Please update the app to continue.</p>
      <button id="vrnForceUpdateBtn" style="background:#134B35;color:#fff;border:none;border-radius:999px;padding:14px 34px;font-weight:700;font-size:.9rem;cursor:pointer;">Update Now</button>
    `;
    document.body.appendChild(overlay);
    document.getElementById('vrnForceUpdateBtn').addEventListener('click', () => {
      const url = platform === 'ios'
        ? 'https://apps.apple.com/app/id0000000000'
        : 'https://play.google.com/store/apps/details?id=com.virtualrishtanaata.app';
      if (window.Capacitor?.Plugins?.Browser) {
        window.Capacitor.Plugins.Browser.open({ url });
      } else {
        window.location.href = url;
      }
    });
  };
  if (document.body) inject();
  else document.addEventListener('DOMContentLoaded', inject);
}
