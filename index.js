// ---- GA Events helper ----
function fireGA(eventName, params = {}) {
  try {
    if (typeof gtag === 'function') {
      gtag('event', eventName, params);
    } else if (window.dataLayer) {
      window.dataLayer.push({ event: eventName, ...params });
    }
  } catch (_) {}
}

const themeStorageKey = 'boomboxcar-theme';
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');

function getStoredTheme() {
  try {
    const theme = localStorage.getItem(themeStorageKey);
    return theme === 'dark' || theme === 'light' ? theme : null;
  } catch (_) { return null; }
}

function applyTheme(theme) {
  const isDark = theme === 'dark';
  const isSpanish = document.documentElement.lang.startsWith('es');
  const label = isSpanish
    ? (isDark ? 'Cambiar al modo claro' : 'Cambiar al modo oscuro')
    : (isDark ? 'Switch to light mode' : 'Switch to dark mode');
  const toggle = document.querySelector('.theme-toggle');
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
    meta.content = isDark ? '#101214' : '#ffffff';
  });
  if (toggle) {
    toggle.setAttribute('aria-label', label);
    toggle.setAttribute('aria-pressed', String(isDark));
    toggle.title = label;
  }
}

function bindThemeToggle() {
  const toggle = document.querySelector('.theme-toggle');
  if (!toggle) return;
  applyTheme(getStoredTheme() || (systemTheme.matches ? 'dark' : 'light'));
  toggle.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(themeStorageKey, next); } catch (_) {}
    applyTheme(next);
  });
  const syncSystemTheme = event => {
    if (!getStoredTheme()) applyTheme(event.matches ? 'dark' : 'light');
  };
  if (typeof systemTheme.addEventListener === 'function') systemTheme.addEventListener('change', syncSystemTheme);
  else systemTheme.addListener(syncSystemTheme);
  window.addEventListener('storage', event => {
    if (event.key === themeStorageKey) applyTheme(getStoredTheme() || (systemTheme.matches ? 'dark' : 'light'));
  });
}

// ---- Ensure GA event sends before same-tab navigation (best-effort) ----
function bindTrackedLink(el, eventName) {
  if (!el || el.dataset.gaBound === '1') return;
  el.dataset.gaBound = '1';
  el.addEventListener('click', (e) => {
    const href = el.getAttribute('href') || '';

    // Build event params for GA4
    const params = {
      link_url: href,
      link_text: (el.textContent || '').trim(),
      cta_position: el.id === 'ctaBook' ? 'sticky' : (el.closest('.hero') ? 'hero' : 'body'),
      lang: document.documentElement.lang || 'en'
    };

    // Always record the click
    fireGA(eventName, params);

    // Respect new-tab/middle-clicks and modifier keys
    const modified = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
    const nonLeft = e.button !== 0;
    const isTel = href.startsWith('tel:');
    const isMail = href.startsWith('mailto:');
    const isHash = href.startsWith('#');

    if (modified || nonLeft || isTel || isMail || isHash) {
      // Let the browser handle default behavior
      return;
    }

    // Same-tab link: delay briefly so GA can send, then navigate
    e.preventDefault();
    const t = setTimeout(() => { window.location.href = href; }, 120);
    try {
      if (typeof gtag === 'function') {
        gtag('event', eventName, {
          ...params,
          event_callback: () => { clearTimeout(t); window.location.href = href; }
        });
      }
    } catch (_) {}
  });
}

// ---- DOM Ready: footer year, bindings, impressions ----
document.addEventListener('DOMContentLoaded', () => {
  bindThemeToggle();
  // Year in footer
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  // Attach tracking
  bindTrackedLink(document.getElementById('ctaBook'), 'booking_builder_click');
  document.querySelectorAll('[data-gtag="booking_builder_click"]').forEach(a => bindTrackedLink(a, 'booking_builder_click'));
  bindTrackedLink(document.getElementById('telLink'), 'click_phone_header');
  bindTrackedLink(document.getElementById('emailLink'), 'click_email_header');
  bindTrackedLink(document.getElementById('contactPhone'), 'click_phone_contact');
  bindTrackedLink(document.getElementById('contactEmail'), 'click_email_contact');
  bindTrackedLink(document.getElementById('instagramLink'), 'click_instagram');

  // ---- CTA impressions & visibility ----
  const heroCta = document.querySelector('.hero [data-gtag="booking_builder_click"]');
  if (heroCta && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          fireGA('cta_impression', { cta_position: 'hero' });
          io.unobserve(heroCta);
        }
      });
    }, { threshold: 0.5 });
    io.observe(heroCta);
  }

  // Show sticky CTA only after user scrolls a bit
  let stickySeen = false;
  function updateStickyVisibility(){
    if (window.scrollY > 20) {
      document.body.classList.add('cta-visible');
      if (!stickySeen) { fireGA('cta_impression', { cta_position: 'sticky' }); stickySeen = true; }
    } else {
      document.body.classList.remove('cta-visible');
    }
  }
  updateStickyVisibility();
  window.addEventListener('scroll', updateStickyVisibility, { passive: true });
  window.addEventListener('resize', updateStickyVisibility, { passive: true });
});
