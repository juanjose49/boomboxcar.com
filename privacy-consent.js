(() => {
  const consentKey = 'boomboxcarAnalyticsConsent.v1';
  const attributionKey = 'boomboxcarAttribution.v1';
  const measurementId = 'G-FQ1TV8G46E';
  const partnerEntry = Boolean(window.__boomboxcarPartnerEntry);
  let analyticsLoaded = false;
  let choice = readChoice();

  const copy = document.documentElement.lang.toLowerCase().startsWith('es') ? {
    title: 'Tu privacidad',
    body: 'Usamos almacenamiento necesario para reservas y pases de socios. Con tu permiso, usamos Google Analytics para medir visitas y campañas.',
    necessary: 'Solo lo necesario',
    allow: 'Permitir analítica',
    details: 'Privacidad y almacenamiento'
  } : {
    title: 'Your privacy',
    body: 'We use necessary storage for bookings and Partner Passes. With your permission, we use Google Analytics to measure visits and campaigns.',
    necessary: 'Necessary only',
    allow: 'Allow analytics',
    details: 'Privacy and storage'
  };

  function readChoice() {
    try {
      const saved = localStorage.getItem(consentKey);
      return saved === 'granted' || saved === 'denied' ? saved : null;
    } catch (_) {
      return null;
    }
  }

  function analyticsConfig() {
    if (location.pathname.startsWith('/confirmation/')) return { send_page_view: false };
    if (location.pathname.startsWith('/partner/')) {
      return { page_location: `${location.origin}/partner/`, page_path: '/partner/' };
    }
    if (partnerEntry) {
      return { page_location: `${location.origin}/?partner_pass=1#book` };
    }
    return {};
  }

  function sendToDataLayer(args) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(args);
  }

  window.gtag = function gtag() {
    const args = Array.from(arguments);
    if (choice === 'granted') sendToDataLayer(args);
  };

  function loadAnalytics() {
    if (analyticsLoaded) return;
    analyticsLoaded = true;
    window[`ga-disable-${measurementId}`] = false;
    sendToDataLayer(['js', new Date()]);
    sendToDataLayer(['config', measurementId, analyticsConfig()]);

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    script.dataset.boomboxcarAnalytics = 'true';
    document.head.append(script);
  }

  function expireAnalyticsCookies() {
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    const cookieNames = ['_ga', `_ga_${measurementId.slice(2).replaceAll('-', '_')}`];
    const rootDomain = location.hostname.replace(/^www\./, '');
    const domains = ['', `; Domain=.${rootDomain}`];
    cookieNames.forEach(name => domains.forEach(domain => {
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${secure}${domain}`;
    }));
  }

  function setChoice(nextChoice) {
    choice = nextChoice;
    try { localStorage.setItem(consentKey, nextChoice); } catch (_) {}

    if (nextChoice === 'granted') {
      loadAnalytics();
    } else {
      window[`ga-disable-${measurementId}`] = true;
      try { sessionStorage.removeItem(attributionKey); } catch (_) {}
      expireAnalyticsCookies();
    }

    document.getElementById('privacyConsent')?.setAttribute('hidden', '');
    window.dispatchEvent(new CustomEvent('boomboxcar:analytics-consent', {
      detail: { analytics: nextChoice }
    }));
  }

  function showChoices() {
    document.getElementById('privacyConsent')?.removeAttribute('hidden');
  }

  function renderBanner() {
    const banner = document.createElement('section');
    banner.id = 'privacyConsent';
    banner.className = 'privacy-consent';
    banner.setAttribute('aria-labelledby', 'privacyConsentTitle');
    banner.innerHTML = `
      <div class="privacy-consent__copy">
        <strong id="privacyConsentTitle">${copy.title}</strong>
        <p>${copy.body} <a href="${document.documentElement.lang.toLowerCase().startsWith('es') ? '/es/privacidad/' : '/privacy/'}">${copy.details}</a></p>
      </div>
      <div class="privacy-consent__actions">
        <button type="button" class="privacy-choice privacy-choice--secondary" data-consent="denied">${copy.necessary}</button>
        <button type="button" class="privacy-choice privacy-choice--primary" data-consent="granted">${copy.allow}</button>
      </div>`;
    if (choice !== null) banner.hidden = true;
    banner.addEventListener('click', event => {
      const button = event.target.closest('[data-consent]');
      if (button) setChoice(button.dataset.consent);
    });
    document.body.append(banner);

    document.addEventListener('click', event => {
      const settingsLink = event.target.closest('[data-privacy-settings]');
      if (!settingsLink) return;
      event.preventDefault();
      showChoices();
    });
  }

  window.BoomBoxCarPrivacy = {
    analyticsAllowed: () => choice === 'granted',
    getAnalyticsChoice: () => choice,
    setAnalyticsChoice: setChoice,
    showChoices
  };

  if (choice === 'granted') loadAnalytics();
  else window[`ga-disable-${measurementId}`] = true;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderBanner, { once: true });
  else renderBanner();
})();
