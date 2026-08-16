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

function syncExperienceOrder() {
  const main = document.querySelector('main');
  if (!main) return;
  const experienceOrder = ['.experience-video', '.gallery-party'];
  const remainingOrder = ['.booking', '.features', '.pricing', '.events', '.faqs', '.contact'];
  [...experienceOrder, ...remainingOrder].forEach(selector => {
    const section = main.querySelector(`:scope > ${selector}`);
    if (section) main.append(section);
  });
}

function getStoredTheme() {
  try {
    const theme = localStorage.getItem(themeStorageKey);
    return theme === 'dark' || theme === 'light' ? theme : null;
  } catch (_) { return null; }
}

function applyTheme(theme) {
  const isDark = theme === 'dark';
  const previousTheme = document.documentElement.dataset.theme;
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
  syncExperienceOrder();
  if (previousTheme !== theme) {
    window.dispatchEvent(new CustomEvent('boomboxcar:themechange', { detail: { theme } }));
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

function bindExperienceVideos() {
  const video = document.querySelector('[data-experience-video]');
  if (!video) return;
  const hero = video.closest('.hero');
  if (!hero) return;
  const fallback = hero.querySelector('[data-video-fallback]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const size = window.innerWidth >= 1200 ? 'Large' : (window.innerWidth >= 640 ? 'Medium' : 'Small');
  let currentPeriod = '';
  let sourceLoaded = false;
  let loadRequested = false;

  const showFallback = () => {
    if (!fallback) return;
    const sourceKey = currentPeriod === 'night' ? 'srcNight' : 'srcDay';
    fallback.querySelectorAll('source').forEach(source => {
      const path = source.dataset[sourceKey];
      if (path) source.srcset = path;
    });
    const image = fallback.querySelector('img');
    const imagePath = image?.dataset[sourceKey];
    if (image && imagePath) image.src = imagePath;
    hero.classList.remove('has-video');
    hero.classList.add('has-fallback');
  };

  const showVideo = () => {
    if (reducedMotion.matches || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    hero.classList.remove('has-fallback');
    hero.classList.add('has-video');
  };

  const loadVideo = () => {
    if (reducedMotion.matches || !currentPeriod) return;
    if (!sourceLoaded) {
      const period = currentPeriod === 'night' ? 'Night' : 'Day';
      const source = video.dataset[`src${period}${size}`];
      if (!source) return;
      video.src = source;
      video.load();
      sourceLoaded = true;
    }
    video.play().then(showVideo).catch(() => {});
  };

  const selectThemeMedia = theme => {
    const nextPeriod = theme === 'dark' ? 'night' : 'day';
    if (nextPeriod === currentPeriod) return;
    currentPeriod = nextPeriod;
    hero.dataset.experience = `${currentPeriod}-video`;
    sourceLoaded = false;
    video.pause();
    video.removeAttribute('src');
    hero.classList.remove('has-video', 'has-fallback');
    fallback?.querySelectorAll('source').forEach(source => source.removeAttribute('srcset'));
    fallback?.querySelector('img')?.removeAttribute('src');
    if (reducedMotion.matches) showFallback();
    else if (loadRequested) loadVideo();
    else video.load();
  };

  video.addEventListener('loadeddata', showVideo);
  video.addEventListener('error', () => {
    if (sourceLoaded) showFallback();
  });

  const handleReducedMotion = event => {
    if (event.matches) {
      video.pause();
      showFallback();
    } else loadVideo();
  };
  if (typeof reducedMotion.addEventListener === 'function') reducedMotion.addEventListener('change', handleReducedMotion);
  else reducedMotion.addListener(handleReducedMotion);

  window.addEventListener('boomboxcar:themechange', event => selectThemeMedia(event.detail.theme));
  selectThemeMedia(document.documentElement.dataset.theme || (systemTheme.matches ? 'dark' : 'light'));

  if (!reducedMotion.matches && 'IntersectionObserver' in window) {
    const loader = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        loadRequested = true;
        loadVideo();
        loader.disconnect();
      }
    }, { rootMargin: '300px' });
    loader.observe(hero);
  } else if (!reducedMotion.matches) {
    loadRequested = true;
    loadVideo();
  } else showFallback();
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
      cta_position: el.closest('.hero') ? 'hero' : 'body',
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
  bindExperienceVideos();

  // Year in footer
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  // Attach tracking
  document.querySelectorAll('[data-gtag="booking_builder_click"]').forEach(a => bindTrackedLink(a, 'booking_builder_click'));
  bindTrackedLink(document.getElementById('emailLink'), 'click_email_header');
  bindTrackedLink(document.getElementById('contactEmail'), 'click_email_contact');
  bindTrackedLink(document.getElementById('instagramLink'), 'click_instagram');

  // ---- CTA impressions & visibility ----
  const heroCtas = document.querySelectorAll('.hero [data-gtag="booking_builder_click"]');
  if (heroCtas.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const period = entry.target.closest('.hero')?.dataset.experience || 'hero';
          fireGA('cta_impression', { cta_position: 'hero', period });
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    heroCtas.forEach(heroCta => io.observe(heroCta));
  }
});
