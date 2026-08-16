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

function syncExperienceOrder(theme) {
  const main = document.querySelector('main');
  if (!main) return;
  const periodOrder = theme === 'dark'
    ? ['.experience-night', '.experience-day', '.gallery-day', '.gallery-night']
    : ['.experience-day', '.experience-night', '.gallery-night', '.gallery-day'];
  const remainingOrder = ['.booking', '.features', '.pricing', '.events', '.faqs', '.contact'];
  [...periodOrder, ...remainingOrder].forEach(selector => {
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
  syncExperienceOrder(theme);
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
  const videos = Array.from(document.querySelectorAll('[data-experience-video]'));
  if (!videos.length) return;
  const isSpanish = document.documentElement.lang.startsWith('es');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const size = window.innerWidth >= 1200 ? 'Large' : (window.innerWidth >= 640 ? 'Medium' : 'Small');

  videos.forEach(video => {
    const hero = video.closest('.hero');
    const controls = hero?.querySelector('[data-video-controls]');
    const pauseButton = hero?.querySelector('[data-video-pause]');
    const soundButton = hero?.querySelector('[data-video-sound]');
    if (!hero || !controls || !pauseButton || !soundButton) return;

    const period = hero.dataset.experience === 'night-video' ? 'night' : 'day';
    let userPaused = false;
    let sourceLoaded = false;

    const updateControls = () => {
      const pausedLabel = isSpanish ? 'Reproducir video' : 'Play video';
      const playingLabel = isSpanish ? 'Pausar video' : 'Pause video';
      const mutedLabel = isSpanish ? 'Activar sonido' : 'Sound on';
      const audibleLabel = isSpanish ? 'Silenciar' : 'Mute';
      pauseButton.textContent = video.paused ? pausedLabel : playingLabel;
      pauseButton.setAttribute('aria-label', `${video.paused ? pausedLabel : playingLabel}: ${period}`);
      soundButton.textContent = video.muted ? mutedLabel : audibleLabel;
      soundButton.setAttribute('aria-label', `${video.muted ? mutedLabel : audibleLabel}: ${period}`);
    };

    const showVideo = () => {
      if (reducedMotion.matches || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      hero.classList.add('has-video');
      controls.hidden = false;
      updateControls();
    };

    const loadVideo = () => {
      if (reducedMotion.matches) return;
      if (!sourceLoaded) {
        const source = video.dataset[`src${size}`];
        if (!source) return;
        video.src = source;
        video.load();
        sourceLoaded = true;
      }
      if (!userPaused) video.play().then(showVideo).catch(() => {});
    };

    video.addEventListener('loadeddata', showVideo);
    video.addEventListener('play', updateControls);
    video.addEventListener('pause', updateControls);
    video.addEventListener('volumechange', updateControls);
    video.addEventListener('error', () => {
      hero.classList.remove('has-video');
      controls.hidden = true;
    });

    pauseButton.addEventListener('click', () => {
      const willPlay = video.paused;
      userPaused = !willPlay;
      if (willPlay) video.play().then(showVideo).catch(() => {});
      else video.pause();
      fireGA(willPlay ? 'hero_video_play' : 'hero_video_pause', { period, lang: document.documentElement.lang || 'en' });
    });

    soundButton.addEventListener('click', () => {
      const willUnmute = video.muted;
      if (willUnmute) videos.forEach(other => { if (other !== video) other.muted = true; });
      video.muted = !willUnmute;
      if (video.paused) video.play().catch(() => {});
      fireGA(willUnmute ? 'hero_video_unmute' : 'hero_video_mute', { period, lang: document.documentElement.lang || 'en' });
    });

    const handleReducedMotion = event => {
      if (event.matches) {
        video.pause();
        hero.classList.remove('has-video');
        controls.hidden = true;
      } else loadVideo();
    };
    if (typeof reducedMotion.addEventListener === 'function') reducedMotion.addEventListener('change', handleReducedMotion);
    else reducedMotion.addListener(handleReducedMotion);

    if (!reducedMotion.matches && 'IntersectionObserver' in window) {
      const loader = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          loadVideo();
          loader.disconnect();
        }
      }, { rootMargin: '300px' });
      loader.observe(hero);
    } else if (!reducedMotion.matches) loadVideo();
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
