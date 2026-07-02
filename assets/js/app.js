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
