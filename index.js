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
  const media = document.querySelector('[data-experience-media]');
  if (!media) return;
  const layers = Array.from(media.querySelectorAll('[data-video-layer]'));
  if (layers.length < 2) return;
  const hero = media.closest('.hero');
  if (!hero) return;
  const fallback = media.querySelector('[data-video-fallback]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const size = window.innerWidth >= 1200 ? 'Large' : (window.innerWidth >= 640 ? 'Medium' : 'Small');
  const transitionMs = 2000;
  let currentPeriod = '';
  let loadRequested = false;
  let activeVideo = null;
  let switchToken = 0;
  let fadeTimer = null;

  const setFallbackSource = () => {
    if (!fallback) return;
    const sourceKey = currentPeriod === 'night' ? 'srcNight' : 'srcDay';
    fallback.querySelectorAll('source').forEach(source => {
      const path = source.dataset[sourceKey];
      if (path) source.srcset = path;
    });
    const image = fallback.querySelector('img');
    const imagePath = image?.dataset[sourceKey];
    if (image && imagePath) image.src = imagePath;
  };

  const stopLayer = layer => {
    layer.pause();
    layer.classList.remove('is-current', 'is-underlay', 'is-fading-out');
  };

  const finishFallbackTransition = previous => {
    if (previous) stopLayer(previous);
    activeVideo = null;
    hero.classList.remove('has-video');
  };

  const showFallback = (previous = activeVideo) => {
    setFallbackSource();
    hero.classList.add('has-fallback');
    if (!previous) {
      finishFallbackTransition(null);
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => previous.classList.add('is-fading-out')));
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => finishFallbackTransition(previous), transitionMs);
  };

  const sourceFor = period => {
    const label = period === 'night' ? 'Night' : 'Day';
    return media.dataset[`src${label}${size}`] || '';
  };

  const prepareLayer = (layer, period) => new Promise((resolve, reject) => {
    const source = sourceFor(period);
    if (!source) {
      reject(new Error('Missing video source'));
      return;
    }

    const play = () => layer.play().then(resolve).catch(reject);
    if (layer.dataset.period === period && layer.getAttribute('src') === source && layer.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      play();
      return;
    }

    const cleanup = () => {
      layer.removeEventListener('loadeddata', handleReady);
      layer.removeEventListener('error', handleError);
    };
    const handleReady = () => {
      cleanup();
      play();
    };
    const handleError = () => {
      cleanup();
      reject(new Error(`Unable to load ${period} video`));
    };
    layer.addEventListener('loadeddata', handleReady);
    layer.addEventListener('error', handleError);
    layer.dataset.period = period;
    layer.src = source;
    layer.load();
  });

  const selectThemeMedia = async theme => {
    const nextPeriod = theme === 'dark' ? 'night' : 'day';
    currentPeriod = nextPeriod;
    hero.dataset.experience = `${currentPeriod}-video`;
    if (reducedMotion.matches) {
      switchToken += 1;
      layers.forEach(stopLayer);
      activeVideo = null;
      showFallback(null);
      return;
    }
    if (!loadRequested) return;

    const token = ++switchToken;
    clearTimeout(fadeTimer);
    if (activeVideo?.dataset.period === currentPeriod) {
      layers.filter(layer => layer !== activeVideo).forEach(stopLayer);
      activeVideo.classList.remove('is-fading-out', 'is-underlay');
      activeVideo.classList.add('is-current');
      hero.classList.remove('has-fallback');
      hero.classList.add('has-video');
      return;
    }

    const previous = activeVideo;
    if (previous) previous.classList.remove('is-fading-out');
    const destination = layers.find(layer => layer !== previous) || layers[0];
    stopLayer(destination);
    if (previous) destination.classList.add('is-underlay');

    try {
      await prepareLayer(destination, currentPeriod);
    } catch (_) {
      if (token !== switchToken) return;
      stopLayer(destination);
      showFallback(previous);
      return;
    }
    if (token !== switchToken) {
      if (destination.dataset.period !== currentPeriod) stopLayer(destination);
      return;
    }

    hero.classList.remove('has-fallback');
    hero.classList.add('has-video');
    if (!previous) {
      destination.classList.remove('is-underlay');
      destination.classList.add('is-current');
      activeVideo = destination;
      return;
    }

    destination.classList.add('is-underlay');
    requestAnimationFrame(() => requestAnimationFrame(() => previous.classList.add('is-fading-out')));
    fadeTimer = setTimeout(() => {
      if (token !== switchToken) return;
      stopLayer(previous);
      destination.classList.remove('is-underlay');
      destination.classList.add('is-current');
      activeVideo = destination;
    }, transitionMs);
  };

  layers.forEach(layer => {
    layer.addEventListener('error', () => {
      if (layer === activeVideo) showFallback(layer);
    });
  });

  const handleReducedMotion = event => {
    if (event.matches) {
      switchToken += 1;
      clearTimeout(fadeTimer);
      layers.forEach(stopLayer);
      activeVideo = null;
      showFallback(null);
    } else {
      loadRequested = true;
      selectThemeMedia(document.documentElement.dataset.theme);
    }
  };
  if (typeof reducedMotion.addEventListener === 'function') reducedMotion.addEventListener('change', handleReducedMotion);
  else reducedMotion.addListener(handleReducedMotion);

  window.addEventListener('boomboxcar:themechange', event => { selectThemeMedia(event.detail.theme); });
  currentPeriod = document.documentElement.dataset.theme === 'dark' ? 'night' : 'day';
  hero.dataset.experience = `${currentPeriod}-video`;

  if (!reducedMotion.matches && 'IntersectionObserver' in window) {
    const loader = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        loadRequested = true;
        selectThemeMedia(document.documentElement.dataset.theme);
        loader.disconnect();
      }
    }, { rootMargin: '300px' });
    loader.observe(hero);
  } else if (!reducedMotion.matches) {
    loadRequested = true;
    selectThemeMedia(document.documentElement.dataset.theme);
  } else showFallback(null);
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
