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

// Shared behaviours: mobile nav toggle, reveal-on-scroll, generic sheet/overlay helpers
document.addEventListener('DOMContentLoaded', () => {
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
  if (permStatus.receive === 'prompt') {
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

    const logoutBtn = document.createElement('button');
    logoutBtn.type = 'button';
    logoutBtn.className = 'btn btn-outline btn-sm';
    logoutBtn.textContent = 'Log Out';
    logoutBtn.onclick = () => vrnSignOut();

    navCta.insertBefore(logoutBtn, navCta.firstChild);
    navCta.insertBefore(chip, logoutBtn);
  });

  // Mobile menu shows the same two links in a simple vertical list — swap
  // them the same way rather than trying to fit the avatar chip in there.
  document.querySelectorAll('.mobile-menu a[href="/login.html"]').forEach(a => {
    a.textContent = 'My Account (' + profile.ref_code + ')';
    a.href = '/account.html';
  });
  document.querySelectorAll('.mobile-menu a[href="/signup.html"]').forEach(a => {
    a.textContent = 'Log Out';
    a.href = '#';
    a.onclick = (e) => { e.preventDefault(); vrnSignOut(); };
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

// Stripe's success/cancel URLs point back at this app's custom URL scheme
// (see supabase/functions for how "native: true" changes those URLs) so the
// OS hands control back to the app once Checkout finishes. This just closes
// the browser tab and reloads the same bundled page with the same query
// params the website flow already knows how to handle.
if (window.Capacitor?.Plugins?.App) {
  window.Capacitor.Plugins.App.addListener('appUrlOpen', async (data) => {
    try {
      const url = new URL(data.url);
      if (url.protocol !== 'com.virtualrishtanaata.app:') return;
      if (window.Capacitor.Plugins.Browser) {
        await window.Capacitor.Plugins.Browser.close().catch(() => {});
      }
      const page = url.searchParams.get('page');
      if (!page) return;
      url.searchParams.delete('page');
      window.location.href = `/${page}?${url.searchParams.toString()}`;
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
