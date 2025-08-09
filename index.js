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
  // Year in footer
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  // Attach tracking
  bindTrackedLink(document.getElementById('ctaBook'), 'book_on_square_click');
  document.querySelectorAll('[data-gtag="book_on_square_click"]').forEach(a => bindTrackedLink(a, 'book_on_square_click'));
  bindTrackedLink(document.getElementById('telLink'), 'click_phone_header');
  bindTrackedLink(document.getElementById('emailLink'), 'click_email_header');
  bindTrackedLink(document.getElementById('contactPhone'), 'click_phone_contact');
  bindTrackedLink(document.getElementById('contactEmail'), 'click_email_contact');
  bindTrackedLink(document.getElementById('instagramLink'), 'click_instagram');

  // ---- CTA impressions & visibility ----
  const heroCta = document.querySelector('.hero [data-gtag="book_on_square_click"]');
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