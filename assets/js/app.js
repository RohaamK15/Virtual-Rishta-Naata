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
});

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
async function vrnOpenCheckout(url) {
  if (window.Capacitor?.isNativePlatform?.() && window.Capacitor.Plugins?.Browser) {
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
