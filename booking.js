(() => {
  const form = document.getElementById('bookingBuilder');
  if (!form) return;

  const apiBase = '/api';
  const isSpanish = (form.dataset.locale || document.documentElement.lang).toLowerCase().startsWith('es');
  const locale = isSpanish ? 'es-US' : 'en-US';
  const apiLocale = isSpanish ? 'es' : 'en';
  const copy = isSpanish ? {
    chooseDate: 'Elige una fecha y hora de llegada', chooseDuration: 'Elige una duración',
    chooseDurationFirst: 'Elige primero una duración', chooseDurationForAddons: 'Elige una duración para ver los extras.',
    hour: 'hora', hours: 'horas', base: 'Servicio base',
    notice: 'La fecha y hora deben tener al menos 18 horas de antelación.', noteTitle: 'DETALLES DE BOOMBOXCAR',
    date: 'Fecha y hora', duration: 'Duración', addons: 'Extras', none: 'Ninguno', address: 'Dirección',
    eventType: 'Tipo de evento', setting: 'Entorno', attendance: 'Asistencia esperada', requests: 'Solicitudes especiales',
    estimatedTotal: 'Total estimado', customQuote: 'cotización personalizada', chooseDateFirst: 'Elige una fecha primero',
    chooseTime: 'Elige una hora de llegada', loading: 'Consultando la disponibilidad de Square…',
    noSlots: 'No hay horas disponibles para esta fecha y duración.',
    fallback: 'La disponibilidad en línea no está disponible temporalmente. Inténtalo de nuevo en unos minutos.',
    apiSubmit: 'Reservar y pagar', fallbackSubmit: 'Pago no disponible',
    apiHandoff: 'Completa el pago aquí para confirmar tu reserva. Square procesa los datos de tu tarjeta de forma segura; BoomBoxCar no recibe ni almacena el número de tarjeta.',
    fallbackHandoff: 'El pago en línea no está disponible temporalmente. Inténtalo de nuevo en unos minutos.',
    submitting: 'Procesando el pago con tarjeta de forma segura…', paymentReady: 'Pago completado. Abriendo tu confirmación…',
    cardError: 'No se pudo completar el pago con tarjeta. Revisa los datos e inténtalo de nuevo.',
    paymentUnavailable: 'El pago en línea no está disponible temporalmente. Inténtalo de nuevo en unos minutos.',
    applePayProcessing: 'Procesando Apple Pay de forma segura…', applePayReady: 'Pago completado. Abriendo tu confirmación…',
    applePayError: 'Apple Pay no pudo completar el pago. Inténtalo de nuevo o paga con tarjeta.',
    googlePayProcessing: 'Procesando Google Pay de forma segura…', googlePayReady: 'Pago completado. Abriendo tu confirmación…',
    googlePayError: 'Google Pay no pudo completar el pago. Inténtalo de nuevo o paga con tarjeta.',
    couponApply: 'Aplicando cupón…', couponApplied: amount => `Cupón aplicado: −${amount}`,
    couponInvalid: 'Ese código de cupón no es válido.', couponNeedsApply: 'Aplica el código de cupón antes de continuar.',
    couponExceedsTotal: 'El cupón debe dejar al menos $0.01 por pagar.',
    couponLabel: code => `Cupón ${code}`,
    error: 'No pudimos crear la reserva. Revisa los datos o elige otra hora.',
    modifiersLoading: 'Cargando los extras configurados en Square…', noModifiers: 'No hay extras disponibles para este paquete.',
    modifiersUnavailable: 'Los extras no están disponibles temporalmente.', optional: 'Opcional',
    required: 'Requerido', upTo: 'Hasta', selections: 'selecciones', quantity: 'Cantidad',
    invalidModifiers: 'Revisa la cantidad de extras seleccionados.',
    incompleteForm: 'Completa todos los campos obligatorios antes de continuar al pago.',
    includedLabel: 'Incluido en cada reserva',
    includedItems: 'Equipo de audio profesional, BoomBox inflable, dos micrófonos inalámbricos, música con licencia y seguro comercial, burbujas de día, paneles de luz RGB de noche, apoyo de maestro de ceremonias y anuncios, y energía a bordo sin necesidad de tomacorrientes. El toldo y los efectos de láser y niebla son extras opcionales.',
    staffScope: 'El personal de BoomBoxCar instala y opera el sistema, gestiona la reproducción de música con licencia y brinda apoyo de maestro de ceremonias y anuncios. El servicio dedicado de DJ no está incluido. Tú proporcionas la dirección musical general y el mensaje del evento; el personal conserva el control de la reproducción y la programación.',
    included: 'Incluido', campaignLabel: 'Oferta para clientes nuevos',
    campaignReady: percent => `Oferta verificada: ${percent}% de descuento.`,
    campaignNotEligible: 'Esta oferta es solamente para clientes sin una compra previa completada de BoomBoxCar.',
    campaignNeedsVerify: 'Verifica la oferta para clientes nuevos antes de continuar.'
  } : {
    chooseDate: 'Choose a date and arrival time', chooseDuration: 'Choose a duration',
    chooseDurationFirst: 'Choose a duration first', chooseDurationForAddons: 'Choose a duration to see add-ons.',
    hour: 'hour', hours: 'hours', base: 'Base service',
    notice: 'Date and time must be at least 18 hours from now.', noteTitle: 'BOOMBOXCAR EVENT DETAILS',
    date: 'Date and time', duration: 'Duration', addons: 'Add-ons', none: 'None', address: 'Address',
    eventType: 'Event type', setting: 'Setting', attendance: 'Expected attendance', requests: 'Special requests',
    estimatedTotal: 'Estimated total', customQuote: 'custom quote', chooseDateFirst: 'Choose a date first',
    chooseTime: 'Choose an arrival time', loading: 'Checking live Square availability…',
    noSlots: 'No arrival times are available for this date and duration.',
    fallback: 'Online availability is temporarily unavailable. Please try again in a few minutes.',
    apiSubmit: 'Book and pay', fallbackSubmit: 'Payment unavailable',
    apiHandoff: 'Complete payment here to confirm your booking. Square securely handles your card details; BoomBoxCar never receives or stores your card number.',
    fallbackHandoff: 'Online payment is temporarily unavailable. Please try again in a few minutes.',
    submitting: 'Securely processing card payment…', paymentReady: 'Payment complete. Opening your confirmation…',
    cardError: 'The card payment could not be completed. Check the details and try again.',
    paymentUnavailable: 'Online payment is temporarily unavailable. Please try again in a few minutes.',
    applePayProcessing: 'Securely processing Apple Pay…', applePayReady: 'Payment complete. Opening your confirmation…',
    applePayError: 'Apple Pay could not complete the payment. Try again or pay by card.',
    googlePayProcessing: 'Securely processing Google Pay…', googlePayReady: 'Payment complete. Opening your confirmation…',
    googlePayError: 'Google Pay could not complete the payment. Try again or pay by card.',
    couponApply: 'Applying coupon…', couponApplied: amount => `Coupon applied: −${amount}`,
    couponInvalid: 'That coupon code is not valid.', couponNeedsApply: 'Apply the coupon code before continuing.',
    couponExceedsTotal: 'The coupon must leave at least $0.01 due for payment.',
    couponLabel: code => `Coupon ${code}`,
    error: 'We could not create the reservation. Check the details or choose another time.',
    modifiersLoading: 'Loading your Square add-ons…', noModifiers: 'No add-ons are available for this package.',
    modifiersUnavailable: 'Add-ons are temporarily unavailable.', optional: 'Optional',
    required: 'Required', upTo: 'Up to', selections: 'selections', quantity: 'Quantity',
    invalidModifiers: 'Review the number of add-ons selected.',
    incompleteForm: 'Complete all required fields before continuing to payment.',
    includedLabel: 'Included with every booking',
    includedItems: 'Professional-grade audio equipment, the inflatable BoomBox, two wireless microphones, licensed music and commercial insurance, daytime bubbles, nighttime RGB light panels, MC support and announcements, and on-board power with no outlets required. The shade awning and laser and haze effects are optional add-ons.',
    staffScope: 'BoomBoxCar staff set up and operate the system, manage licensed music playback, and provide MC support and announcements. Dedicated DJ service is not included. You provide general musical direction and the event message; staff retain control of playback and programming.',
    included: 'Included', campaignLabel: 'New customer event offer',
    campaignReady: percent => `Offer verified: ${percent}% off.`,
    campaignNotEligible: 'This offer is only for customers without a previous completed BoomBoxCar purchase.',
    campaignNeedsVerify: 'Verify the new customer offer before continuing.'
  };

  const dateInput = form.elements.eventDate;
  const timeInput = form.elements.eventTime;
  const packageOutput = document.getElementById('summaryPackage');
  const dateOutput = document.getElementById('summaryDate');
  const linesOutput = document.getElementById('summaryLines');
  const totalOutput = document.getElementById('summaryTotal');
  const quoteNote = document.getElementById('quoteNote');
  const availabilityStatus = document.getElementById('availabilityStatus');
  const submitButton = document.getElementById('bookingSubmit');
  const applePayButton = document.getElementById('applePayButton');
  const googlePayButton = document.getElementById('googlePayButton');
  const cardPaymentToggle = document.getElementById('cardPaymentToggle');
  const cardCheckout = document.getElementById('cardCheckout');
  const cardPaymentPanel = document.getElementById('cardPaymentPanel');
  const couponToggle = document.getElementById('couponToggle');
  const couponPanel = document.getElementById('couponPanel');
  const couponInput = document.getElementById('couponCode');
  const couponApplyButton = document.getElementById('couponApply');
  const couponStatus = document.getElementById('couponStatus');
  const handoffNote = document.getElementById('handoffNote');
  const bookingResult = document.getElementById('bookingResult');
  const modifierGroups = document.getElementById('modifierGroups');
  const modifierStatus = document.getElementById('modifierStatus');
  const partnerPassPanel = document.getElementById('partnerPass');
  const partnerPassLead = document.getElementById('partnerPassLead');
  const partnerTerms = document.getElementById('partnerTerms');
  const partnerReserveButton = document.getElementById('partnerReserveButton');
  const campaignOfferPanel = document.getElementById('campaignOffer');
  const campaignOfferTitle = document.getElementById('campaignOfferTitle');
  const campaignOfferDetails = document.getElementById('campaignOfferDetails');
  const campaignOfferStatus = document.getElementById('campaignOfferStatus');
  const campaignOfferVerify = document.getElementById('campaignOfferVerify');
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  let backendReady = false;
  let availabilityController = null;
  let modifierController = null;
  let currentPackage = null;
  let squarePayments = null;
  let cardPayment = null;
  let cardReady = false;
  let applePay = null;
  let applePayRequest = null;
  let googlePay = null;
  let googlePayRequest = null;
  let walletConfig = null;
  let appliedCoupon = null;
  let campaignOffer = null;
  let appliedCampaignOffer = null;
  let campaignEligibilityStatus = '';
  let verifiedCampaignContact = '';
  let partnerPass = null;
  const pageParams = new URLSearchParams(window.location.search);
  let fragmentPartnerToken = '';
  if (window.location.hash.startsWith('#partner_pass=')) {
    try { fragmentPartnerToken = decodeURIComponent(window.location.hash.slice('#partner_pass='.length)); } catch (_) {}
    if (!/^[A-Za-z0-9_-]{22,128}$/.test(fragmentPartnerToken)) fragmentPartnerToken = '';
  }
  const partnerToken = fragmentPartnerToken || (pageParams.get('partner_pass') === '1'
    ? (sessionStorage.getItem('boomboxcarPartnerPassToken.v1') || '')
    : '');
  if (fragmentPartnerToken) {
    try { sessionStorage.setItem('boomboxcarPartnerPassToken.v1', fragmentPartnerToken); } catch (_) {}
    history.replaceState(null, '', '/?partner_pass=1#book');
  }
  delete window.__boomboxcarPartnerEntry;
  const incomingAttribution = {
    ref: pageParams.get('ref') || '', qrCampaignId: pageParams.get('qr') || '',
    utmSource: pageParams.get('utm_source') || '', utmMedium: pageParams.get('utm_medium') || '',
    utmCampaign: pageParams.get('utm_campaign') || '', utmContent: pageParams.get('utm_content') || ''
  };
  const attributionKey = 'boomboxcarAttribution.v1';
  const hasIncomingAttribution = Object.values(incomingAttribution).some(Boolean);
  const emptyAttribution = () => Object.fromEntries(Object.keys(incomingAttribution).map(key => [key, '']));
  const readStoredAttribution = () => {
    try { return JSON.parse(sessionStorage.getItem(attributionKey) || '{}'); } catch (_) { return {}; }
  };
  const analyticsAllowed = () => window.BoomBoxCarPrivacy?.analyticsAllowed() === true;
  let attribution = hasIncomingAttribution
    ? incomingAttribution
    : (analyticsAllowed() ? { ...emptyAttribution(), ...readStoredAttribution() } : emptyAttribution());

  function syncAttributionStorage(event) {
    const allowed = event?.detail?.analytics === 'granted' || analyticsAllowed();
    if (!allowed) {
      try { sessionStorage.removeItem(attributionKey); } catch (_) {}
      return;
    }
    if (!hasIncomingAttribution) attribution = { ...attribution, ...readStoredAttribution() };
    if (Object.values(attribution).some(Boolean)) {
      try { sessionStorage.setItem(attributionKey, JSON.stringify(attribution)); } catch (_) {}
    }
  }

  syncAttributionStorage();
  window.addEventListener('boomboxcar:analytics-consent', syncAttributionStorage);
  let bookingDraftTimer = null;
  let bookingDraftExpiryTimer = null;
  let restoredTimeSelection = null;
  const bookingDraftKey = 'boomboxcarBookingDraft.v2';
  const legacyCustomerDraftKey = 'boomboxcarCustomerDraft.v1';
  const bookingDraftTtlMs = 60 * 60 * 1000;
  let minimumNoticeHours = 18;
  const bookingDraftFields = [
    'addressLine1', 'addressLine2', 'locality', 'administrativeDistrictLevel1', 'postalCode',
    'eventType', 'setting', 'attendance', 'requests',
    'givenName', 'familyName', 'email', 'phone', 'couponCode'
  ];
  const bookingDraftFieldNames = new Set([...bookingDraftFields, 'duration', 'eventDate', 'eventTime']);

  function localDateValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function eventDateParts(date) {
    return Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
  }

  function eventDateValue(date) {
    const { year, month, day } = eventDateParts(date);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function nextEligibleSaturday(noticeHours = minimumNoticeHours) {
    const earliest = new Date(Date.now() + noticeHours * 60 * 60 * 1000);
    const { year, month, day } = eventDateParts(earliest);
    const candidate = new Date(Date.UTC(year, month - 1, day, 12));
    candidate.setUTCDate(candidate.getUTCDate() + ((6 - candidate.getUTCDay() + 7) % 7));
    return localDateValue(new Date(candidate.getUTCFullYear(), candidate.getUTCMonth(), candidate.getUTCDate()));
  }

  dateInput.min = eventDateValue(new Date());
  if (!dateInput.value) dateInput.value = nextEligibleSaturday();

  function selectedDuration() {
    return form.querySelector('input[name="duration"]:checked');
  }

  function selectedStartAt() {
    return timeInput.selectedOptions[0]?.dataset.startAt || '';
  }

  function currentTimeSelection() {
    return { value: timeInput.value, startAt: selectedStartAt() };
  }

  function bookingDraftValues() {
    return Object.fromEntries(bookingDraftFields.map(name => [name, form.elements[name]?.value.trim() || '']));
  }

  function persistBookingDraft() {
    clearTimeout(bookingDraftTimer);
    clearTimeout(bookingDraftExpiryTimer);
    bookingDraftTimer = null;
    try {
      const values = bookingDraftValues();
      if (!Object.values(values).some(Boolean)) {
        localStorage.removeItem(bookingDraftKey);
        return;
      }
      const savedAt = Date.now();
      localStorage.setItem(bookingDraftKey, JSON.stringify({
        version: 2,
        savedAt,
        expiresAt: savedAt + bookingDraftTtlMs,
        durationHours: selectedDuration()?.value || '',
        eventDate: dateInput.value,
        eventTime: timeInput.value,
        startAt: selectedStartAt(),
        values
      }));
      localStorage.removeItem(legacyCustomerDraftKey);
      bookingDraftExpiryTimer = setTimeout(() => {
        try { localStorage.removeItem(bookingDraftKey); } catch (_) {}
      }, bookingDraftTtlMs);
    } catch (_) {}
  }

  function scheduleBookingDraftSave() {
    clearTimeout(bookingDraftTimer);
    bookingDraftTimer = setTimeout(persistBookingDraft, 200);
  }

  function restoreBookingDraft() {
    try {
      const current = JSON.parse(localStorage.getItem(bookingDraftKey) || 'null');
      const legacy = JSON.parse(localStorage.getItem(legacyCustomerDraftKey) || 'null');
      const stored = current?.version === 2 ? current : legacy?.version === 1 ? legacy : null;
      const savedAt = Number(stored?.savedAt);
      if (!stored || !savedAt || Date.now() - savedAt > bookingDraftTtlMs || savedAt > Date.now()) {
        localStorage.removeItem(bookingDraftKey);
        localStorage.removeItem(legacyCustomerDraftKey);
        return;
      }
      for (const name of bookingDraftFields) {
        const control = form.elements[name];
        const value = typeof stored.values?.[name] === 'string' ? stored.values[name] : '';
        if (!control || !value) continue;
        if (name === 'administrativeDistrictLevel1' && !['DC', 'MD', 'VA'].includes(value)) continue;
        if (control instanceof HTMLSelectElement && ![...control.options].some(option => option.value === value)) continue;
        if (name === 'attendance' && (!/^\d{1,6}$/.test(value) || Number(value) < 1)) continue;
        control.value = value;
      }
      if (couponInput?.value) {
        couponPanel.hidden = false;
        couponToggle.setAttribute('aria-expanded', 'true');
      }
      if (stored.version === 2) {
        const duration = form.querySelector(`input[name="duration"][value="${Number(stored.durationHours)}"]`);
        if (duration) duration.checked = true;
        if (/^\d{4}-\d{2}-\d{2}$/.test(stored.eventDate || '') && stored.eventDate >= dateInput.min) {
          dateInput.value = stored.eventDate;
          restoredTimeSelection = {
            value: typeof stored.eventTime === 'string' ? stored.eventTime : '',
            startAt: typeof stored.startAt === 'string' ? stored.startAt : ''
          };
        }
      }
      bookingDraftExpiryTimer = setTimeout(() => {
        try { localStorage.removeItem(bookingDraftKey); } catch (_) {}
      }, Math.max(0, bookingDraftTtlMs - (Date.now() - savedAt)));
    } catch (_) {
      try {
        localStorage.removeItem(bookingDraftKey);
        localStorage.removeItem(legacyCustomerDraftKey);
      } catch (_) {}
    }
  }

  function selectedModifiers() {
    return [...form.querySelectorAll('input[name="modifiers"]:checked')].map(input => {
      const quantityInput = input.closest('.choice-card')?.querySelector('input[data-modifier-quantity]');
      return {
        id: input.value,
        name: input.dataset.name,
        price: Number(input.dataset.price),
        quantity: quantityInput ? Number(quantityInput.value || 1) : 1
      };
    });
  }

  function modifierRuleLabel(group) {
    if (group.included) return copy.included;
    if (group.minSelections > 0 && group.maxSelections > 0) return `${copy.required}: ${group.minSelections}–${group.maxSelections}`;
    if (group.minSelections > 0) return `${copy.required}: ${group.minSelections}+`;
    if (group.maxSelections > 0) return `${copy.upTo} ${group.maxSelections} ${copy.selections}`;
    return copy.optional;
  }

  function renderModifierGroups(packageDetails) {
    modifierGroups.replaceChildren();
    if (!packageDetails.modifierGroups.length) {
      const empty = document.createElement('p');
      empty.className = 'modifier-empty';
      empty.textContent = copy.noModifiers;
      modifierGroups.append(empty);
      modifierStatus.textContent = '';
      return;
    }
    packageDetails.modifierGroups.forEach(group => {
      const section = document.createElement('section');
      section.className = 'modifier-group';
      section.dataset.minSelections = group.minSelections;
      section.dataset.maxSelections = group.maxSelections;
      const title = document.createElement('h4');
      title.className = 'modifier-group-title';
      const titleText = document.createElement('span');
      titleText.textContent = group.name;
      const rule = document.createElement('small');
      rule.textContent = modifierRuleLabel(group);
      title.append(titleText, rule);
      const grid = document.createElement('div');
      grid.className = 'choice-grid addon-grid';
      group.modifiers.forEach(modifier => {
        const label = document.createElement('label');
        label.className = 'choice-card choice-addon';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.name = 'modifiers';
        input.value = modifier.id;
        input.dataset.name = modifier.name;
        input.dataset.price = modifier.price;
        input.checked = modifier.preselected;
        input.disabled = modifier.locked;
        const card = document.createElement('span');
        const name = document.createElement('strong');
        name.textContent = modifier.name;
        const price = document.createElement('small');
        price.textContent = modifier.included ? `${copy.included} • ${money.format(0)}` : (modifier.price ? `+${money.format(modifier.price)}` : money.format(0));
        card.append(name, price);
        if (group.allowQuantities) {
          const quantityLabel = document.createElement('div');
          quantityLabel.className = 'modifier-quantity';
          quantityLabel.textContent = copy.quantity;
          const quantity = document.createElement('input');
          quantity.type = 'number';
          quantity.min = '1';
          quantity.max = '99';
          quantity.value = '1';
          quantity.dataset.modifierQuantity = 'true';
          quantity.setAttribute('aria-label', `${copy.quantity}: ${modifier.name}`);
          quantity.disabled = !input.checked;
          quantityLabel.append(quantity);
          card.append(quantityLabel);
          input.addEventListener('change', () => { quantity.disabled = !input.checked; });
        }
        label.append(input, card);
        grid.append(label);
      });
      section.append(title, grid);
      modifierGroups.append(section);
    });
    modifierStatus.textContent = '';
  }

  function validateModifierRules() {
    for (const group of modifierGroups.querySelectorAll('.modifier-group')) {
      const count = [...group.querySelectorAll('input[name="modifiers"]:checked')].reduce((sum, input) => {
        const quantity = input.closest('.choice-card')?.querySelector('input[data-modifier-quantity]');
        return sum + (quantity ? Number(quantity.value || 1) : 1);
      }, 0);
      const minimum = Number(group.dataset.minSelections || 0);
      const maximum = Number(group.dataset.maxSelections || 0);
      if (count < minimum || (maximum > 0 && count > maximum)) {
        modifierStatus.textContent = copy.invalidModifiers;
        modifierStatus.dataset.state = 'error';
        group.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return false;
      }
    }
    modifierStatus.dataset.state = '';
    return true;
  }

  async function loadPackagePricing() {
    if (!backendReady) return;
    try {
      const response = await fetch(`${apiBase}/packages`, { headers: { Accept: 'application/json' } });
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload.packages)) throw new Error(payload.error?.message || 'Package request failed.');
      payload.packages.forEach(pkg => {
        const hours = Number(pkg.durationHours);
        const price = Number(pkg.basePrice);
        if (!Number.isInteger(hours) || !Number.isFinite(price) || price < 0) return;
        const duration = form.querySelector(`input[name="duration"][value="${hours}"]`);
        if (!duration) return;
        duration.dataset.price = String(price);
        duration.closest('.choice-card')?.querySelector('small')?.replaceChildren(money.format(price));
      });
      updateSummary();
    } catch (_) {
      // The selected package is fetched again below, so a bulk-pricing failure does not block booking.
    }
  }

  async function loadModifiers() {
    modifierController?.abort();
    currentPackage = null;
    modifierGroups.replaceChildren();
    const duration = selectedDuration();
    if (!duration) {
      modifierStatus.textContent = copy.chooseDurationForAddons;
      updateSummary();
      return;
    }
    if (!backendReady) {
      modifierStatus.textContent = copy.modifiersUnavailable;
      updateSummary();
      return;
    }
    modifierController = new AbortController();
    modifierStatus.textContent = copy.modifiersLoading;
    try {
      const response = await fetch(`${apiBase}/modifiers?durationHours=${encodeURIComponent(duration.value)}`, {
        headers: { Accept: 'application/json' }, signal: modifierController.signal
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || 'Catalog request failed.');
      if (selectedDuration() !== duration) return;
      currentPackage = payload;
      duration.dataset.price = payload.basePrice;
      duration.closest('.choice-card').querySelector('small').textContent = money.format(payload.basePrice);
      renderModifierGroups(payload);
      updateSummary();
    } catch (error) {
      if (error.name === 'AbortError') return;
      backendReady = false;
      appliedCoupon = null;
      if (couponInput?.value) {
        couponStatus.textContent = copy.couponNeedsApply;
        couponStatus.dataset.state = 'error';
      }
      modifierGroups.replaceChildren();
      modifierStatus.textContent = copy.modifiersUnavailable;
      if (dateInput.value) fallbackTimeOptions(currentTimeSelection());
      submitButton.textContent = copy.fallbackSubmit;
      handoffNote.textContent = copy.fallbackHandoff;
      updateSummary();
    }
  }

  function setTimeOptions(options, placeholder, preferredSelection = null) {
    const first = document.createElement('option');
    first.value = '';
    first.textContent = placeholder;
    timeInput.replaceChildren(first, ...options);
    timeInput.disabled = options.length === 0;
    if (preferredSelection) {
      const match = options.find(option =>
        (preferredSelection.startAt && option.dataset.startAt === preferredSelection.startAt) ||
        (!preferredSelection.startAt && preferredSelection.value && option.value === preferredSelection.value));
      if (match) timeInput.value = match.value;
    }
  }

  function fallbackTimeOptions(preferredSelection = null) {
    if (!selectedDuration()) return setTimeOptions([], copy.chooseDurationFirst);
    if (!dateInput.value) return setTimeOptions([], copy.chooseDateFirst);
    const options = [];
    const earliest = Date.now() + minimumNoticeHours * 60 * 60 * 1000;
    for (let minutes = 9 * 60; minutes <= 22 * 60; minutes += 30) {
      const hour = Math.floor(minutes / 60);
      const minute = minutes % 60;
      const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      const date = new Date(`${dateInput.value}T${value}`);
      if (date.getTime() < earliest) continue;
      const option = document.createElement('option');
      option.value = value;
      option.textContent = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date);
      options.push(option);
    }
    setTimeOptions(options, copy.chooseTime, preferredSelection);
    availabilityStatus.hidden = false;
    availabilityStatus.textContent = copy.fallback;
    availabilityStatus.dataset.state = 'fallback';
    submitButton.textContent = copy.fallbackSubmit;
    handoffNote.textContent = copy.fallbackHandoff;
    updateSummary();
  }

  async function loadAvailability({ preserveSelection = false, preferredSelection = null } = {}) {
    timeInput.setCustomValidity('');
    availabilityStatus.hidden = false;
    if (!selectedDuration()) {
      dateInput.disabled = true;
      setTimeOptions([], copy.chooseDurationFirst);
      availabilityStatus.textContent = copy.chooseDurationFirst;
      return;
    }
    dateInput.disabled = false;
    if (!dateInput.value) {
      setTimeOptions([], copy.chooseDateFirst);
      availabilityStatus.textContent = backendReady ? copy.chooseDate : copy.fallback;
      availabilityStatus.dataset.state = backendReady ? '' : 'fallback';
      return;
    }
    const selectionToRestore = preferredSelection || (preserveSelection ? currentTimeSelection() : null);
    if (!backendReady) return fallbackTimeOptions(selectionToRestore);

    availabilityController?.abort();
    availabilityController = new AbortController();
    if (preserveSelection && timeInput.value) timeInput.disabled = true;
    else setTimeOptions([], copy.loading);
    availabilityStatus.textContent = copy.loading;
    availabilityStatus.dataset.state = 'loading';
    try {
      const response = await fetch(`${apiBase}/availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: dateInput.value,
          durationHours: Number(selectedDuration().value),
          locale: apiLocale
        }),
        signal: availabilityController.signal
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || 'Availability request failed.');
      const options = payload.slots.map(slot => {
        const option = document.createElement('option');
        option.value = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false
        }).format(new Date(slot.startAt));
        option.textContent = slot.label;
        option.dataset.startAt = slot.startAt;
        return option;
      });
      setTimeOptions(options, options.length ? copy.chooseTime : copy.noSlots, selectionToRestore);
      availabilityStatus.textContent = options.length ? '' : copy.noSlots;
      availabilityStatus.hidden = options.length > 0;
      availabilityStatus.dataset.state = options.length ? 'ready' : 'empty';
      submitButton.textContent = copy.apiSubmit;
      handoffNote.textContent = copy.apiHandoff;
      updateSummary();
    } catch (error) {
      if (error.name === 'AbortError') return;
      fallbackTimeOptions(selectionToRestore);
    }
  }

  function updateSummary() {
    const duration = selectedDuration();
    if (!duration) {
      packageOutput.textContent = copy.chooseDuration;
      totalOutput.textContent = money.format(0);
      linesOutput.replaceChildren();
      dateOutput.textContent = copy.chooseDurationFirst;
      quoteNote.hidden = true;
      updateDigitalWalletRequest();
      return;
    }
    const hours = Number(duration.value);
    const basePrice = Number(duration.dataset.price);
    const modifiers = selectedModifiers();
    const subtotal = modifiers.reduce((sum, modifier) => sum + modifier.price * modifier.quantity, basePrice);
    const discountAmount = offerDiscountAmount(subtotal);
    const partnerDiscount = partnerDiscountAmount(subtotal);
    const total = subtotal - discountAmount - partnerDiscount;

    if (appliedCoupon && couponStatus.dataset.state === 'success') {
      couponStatus.textContent = copy.couponApplied(money.format(discountAmount));
    }

    packageOutput.textContent = `${hours} ${hours === 1 ? copy.hour : copy.hours}`;
    totalOutput.textContent = money.format(total);
    quoteNote.hidden = true;
    const campaignEstimateActive = campaignOffer && campaignEligibilityStatus !== 'ineligible';
    const lines = [{ label: copy.base, price: basePrice }, ...modifiers.map(modifier => ({
      label: `${modifier.name}${modifier.quantity > 1 ? ` × ${modifier.quantity}` : ''}`,
      price: modifier.price * modifier.quantity
    })), ...(partnerPass ? [{ label: partnerPass.activationAvailable ? 'BoomBoxCar Partner Pass' : `${partnerPass.futureDiscountPercent}% Partner Rate`, price: -partnerDiscount }] : []), ...(appliedCoupon ? [{ label: copy.couponLabel(appliedCoupon.code), price: -discountAmount }] : []), ...(campaignEstimateActive ? [{ label: appliedCampaignOffer ? copy.campaignLabel : `${copy.campaignLabel} (${isSpanish ? 'pendiente de verificación' : 'pending verification'})`, price: -discountAmount }] : [])];
    linesOutput.replaceChildren(...lines.map(line => {
      const row = document.createElement('div');
      row.className = 'summary-line';
      const label = document.createElement('span');
      const price = document.createElement('span');
      label.textContent = line.label;
      price.textContent = money.format(line.price);
      row.append(label, price);
      return row;
    }));

    if (dateInput.value && timeInput.value) {
      const startAt = selectedStartAt();
      const date = startAt ? new Date(startAt) : new Date(`${dateInput.value}T${timeInput.value}`);
      dateOutput.textContent = new Intl.DateTimeFormat(locale, {
        timeZone: startAt ? 'America/New_York' : undefined,
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
      }).format(date);
    } else dateOutput.textContent = copy.chooseDate;
    updatePartnerPaymentUi(total);
    updateDigitalWalletRequest();
  }

  function updatePartnerPaymentUi(total) {
    if (!partnerPass || !partnerReserveButton) return;
    const complimentary = partnerPass.activationAvailable && Math.round(total * 100) === 0;
    partnerReserveButton.hidden = !complimentary;
    if (complimentary) {
      applePayButton.hidden = true; googlePayButton.hidden = true; cardPaymentToggle.hidden = true; cardCheckout.hidden = true;
      handoffNote.textContent = isSpanish ? 'Confirma los requisitos para reservar esta activación.' : 'Confirm the activation requirements to reserve this complimentary activation.';
    } else if (cardReady) {
      cardCheckout.hidden = false;
      handoffNote.textContent = copy.apiHandoff;
    }
  }

  function partnerDiscountAmount(subtotal) {
    if (!partnerPass) return 0;
    return partnerPass.activationAvailable
      ? subtotal
      : Math.round(subtotal * partnerPass.futureDiscountPercent) / 100;
  }

  function offerDiscountAmount(subtotal) {
    const provisionalCampaignOffer = campaignOffer && campaignEligibilityStatus !== 'ineligible'
      ? { type: 'PERCENT', value: campaignOffer.discountPercent }
      : null;
    const discount = appliedCampaignOffer || provisionalCampaignOffer || appliedCoupon;
    if (!discount) return 0;
    const subtotalCents = Math.round(subtotal * 100);
    const discountCents = discount.type === 'PERCENT'
      ? discount.value === 100 ? subtotalCents - 1 : Math.round(subtotalCents * discount.value / 100)
      : Math.round(discount.value * 100);
    return Math.min(subtotalCents, Math.max(0, discountCents)) / 100;
  }

  function paymentRequestDetails() {
    const duration = selectedDuration();
    if (!duration) return null;
    const modifiers = selectedModifiers();
    const basePrice = Number(duration.dataset.price);
    const subtotal = modifiers.reduce((sum, modifier) => sum + modifier.price * modifier.quantity, basePrice);
    const discountAmount = offerDiscountAmount(subtotal);
    const partnerDiscount = partnerDiscountAmount(subtotal);
    const total = subtotal - discountAmount - partnerDiscount;
    if (!Number.isFinite(total) || total < 0) return null;
    return {
      countryCode: 'US',
      currencyCode: currentPackage?.currency || 'USD',
      lineItems: [
        { label: `${duration.value} ${Number(duration.value) === 1 ? copy.hour : copy.hours}`, amount: basePrice.toFixed(2) },
        ...modifiers.map(modifier => ({
          label: `${modifier.name}${modifier.quantity > 1 ? ` × ${modifier.quantity}` : ''}`,
          amount: (modifier.price * modifier.quantity).toFixed(2)
        })),
        ...(partnerPass ? [{ label: partnerPass.activationAvailable ? 'BoomBoxCar Partner Pass' : `${partnerPass.futureDiscountPercent}% Partner Rate`, amount: `-${partnerDiscount.toFixed(2)}` }] : []),
        ...(appliedCoupon ? [{ label: copy.couponLabel(appliedCoupon.code), amount: `-${discountAmount.toFixed(2)}` }] : []),
        ...(appliedCampaignOffer ? [{ label: copy.campaignLabel, amount: `-${discountAmount.toFixed(2)}` }] : [])
      ],
      total: { label: 'BoomBoxCar', amount: total.toFixed(2) }
    };
  }

  function updateDigitalWalletRequest() {
    const details = paymentRequestDetails();
    if (!details) return;
    if (applePayRequest) {
      try { applePayRequest.update(details); } catch (_) {}
    }
    if (googlePayRequest) {
      try { googlePayRequest.update(details); } catch (_) {}
    }
  }

  function loadSquareSdk(url) {
    const allowed = new Set([
      'https://web.squarecdn.com/v1/square.js',
      'https://sandbox.web.squarecdn.com/v1/square.js'
    ]);
    if (!allowed.has(url)) return Promise.reject(new Error('Invalid Square SDK URL.'));
    if (window.Square?.payments) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.crossOrigin = 'anonymous';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Square Web Payments SDK could not be loaded.'));
      document.head.append(script);
    });
  }

  async function initializePayments(config) {
    if (!cardCheckout || !cardPaymentPanel || !config.webPaymentsReady || !window.isSecureContext) return false;
    try {
      await loadSquareSdk(config.webPaymentsSdkUrl);
      squarePayments = window.Square.payments(config.applicationId, config.locationId);
      cardCheckout.dataset.initializing = 'true';
      cardCheckout.hidden = false;
      cardPayment = await squarePayments.card();
      await cardPayment.attach('#cardPayment');
      cardReady = true;
      submitButton.disabled = false;
      walletConfig = config;
      await resetDigitalWallet();
      return true;
    } catch (_) {
      cardReady = false;
      cardPayment = null;
      cardCheckout.hidden = true;
      delete cardCheckout.dataset.initializing;
      cardPaymentToggle.hidden = true;
      squarePayments = null;
      applePayRequest = null;
      applePay = null;
      googlePayRequest = null;
      googlePay = null;
      applePayButton.hidden = true;
      googlePayButton.hidden = true;
      return false;
    }
  }

  async function resetDigitalWallet() {
    const previousApplePay = applePay;
    const previousGooglePay = googlePay;
    applePay = null;
    applePayRequest = null;
    googlePay = null;
    googlePayRequest = null;
    applePayButton.hidden = true;
    googlePayButton.hidden = true;
    cardPaymentToggle.hidden = true;
    googlePayButton.replaceChildren();
    if (previousApplePay) {
      try { await previousApplePay.destroy(); } catch (_) {}
    }
    if (previousGooglePay) {
      try { await previousGooglePay.destroy(); } catch (_) {}
    }
    const details = paymentRequestDetails();
    if (!squarePayments || !details) {
      showCardCheckout();
      return false;
    }
    if (walletConfig?.applePayReady) {
      try {
        applePayRequest = squarePayments.paymentRequest(details);
        applePay = await squarePayments.applePay(applePayRequest);
        applePayButton.hidden = false;
        cardCheckout.hidden = true;
        delete cardCheckout.dataset.initializing;
        cardPaymentToggle.hidden = false;
        return true;
      } catch (_) {
        applePayRequest = null;
        applePay = null;
      }
    }
    if (walletConfig?.googlePayReady) {
      try {
        googlePayRequest = squarePayments.paymentRequest(details);
        googlePay = await squarePayments.googlePay(googlePayRequest);
        googlePayButton.hidden = false;
        await googlePay.attach('#googlePayButton', { buttonColor: 'default', buttonType: 'long' });
        cardCheckout.hidden = true;
        delete cardCheckout.dataset.initializing;
        cardPaymentToggle.hidden = false;
        return true;
      } catch (_) {
        googlePayRequest = null;
        googlePay = null;
        googlePayButton.hidden = true;
        googlePayButton.replaceChildren();
      }
    }
    showCardCheckout();
    return false;
  }

  function showCardCheckout() {
    applePayButton.hidden = true;
    googlePayButton.hidden = true;
    cardPaymentToggle.hidden = true;
    cardCheckout.hidden = false;
    delete cardCheckout.dataset.initializing;
    try { cardPayment?.recalculateSize(); } catch (_) {}
  }

  function validateNotice() {
    timeInput.setCustomValidity('');
    if (!dateInput.value || !timeInput.value || selectedStartAt()) return;
    const eventDate = new Date(`${dateInput.value}T${timeInput.value}`);
    if (eventDate < new Date(Date.now() + minimumNoticeHours * 60 * 60 * 1000)) timeInput.setCustomValidity(copy.notice);
  }

  function buildDraft() {
    const duration = selectedDuration();
    const modifiers = selectedModifiers();
    const basePrice = Number(duration.dataset.price);
    const subtotal = modifiers.reduce((sum, modifier) => sum + modifier.price * modifier.quantity, basePrice);
    const discountAmount = offerDiscountAmount(subtotal);
    return {
      locale: apiLocale,
      eventDate: dateInput.value,
      eventTime: timeInput.value,
      startAt: selectedStartAt(),
      durationHours: Number(duration.value),
      basePrice,
      modifiers,
      couponCode: appliedCoupon?.code || '',
      discount: appliedCoupon ? { ...appliedCoupon, amount: discountAmount } : appliedCampaignOffer ? { ...appliedCampaignOffer, amount: discountAmount } : null,
      campaignId: appliedCampaignOffer ? campaignOffer.id : '',
      total: subtotal - discountAmount - partnerDiscountAmount(subtotal),
      address: {
        addressLine1: form.elements.addressLine1.value.trim(),
        addressLine2: form.elements.addressLine2.value.trim(),
        locality: form.elements.locality.value.trim(),
        administrativeDistrictLevel1: form.elements.administrativeDistrictLevel1.value,
        postalCode: form.elements.postalCode.value.trim()
      },
      eventType: form.elements.eventType.value,
      setting: form.elements.setting.value,
      attendance: Number(form.elements.attendance.value),
      requests: form.elements.requests.value.trim(),
      customer: {
        givenName: form.elements.givenName.value.trim(),
        familyName: form.elements.familyName.value.trim(),
        email: form.elements.email.value.trim(),
        phone: form.elements.phone.value.trim()
      },
      partnerToken: partnerPass ? partnerToken : '',
      partnerPermissions: partnerPass?.activationAvailable ? {
        signageAndQr: form.elements.partnerSignageAndQr.checked,
        photoVideo: form.elements.partnerPhotoVideo.checked,
        publicIdentification: form.elements.partnerPublicIdentification.checked,
        safetyAndVenue: form.elements.partnerSafetyAndVenue.checked
      } : undefined,
      attribution: partnerPass ? { ...attribution, sourceReferralId: partnerPass.code, qrCampaignId: attribution.qrCampaignId || `${partnerPass.code}-ACTIVATION` } : attribution
    };
  }

  function analyticsItems(draft) {
    return [
      {
        item_id: `boomboxcar_${draft.durationHours}h`,
        item_name: `${draft.durationHours}-hour BoomBoxCar booking`,
        item_brand: 'BoomBoxCar',
        item_category: 'Event service',
        item_variant: `${draft.durationHours} hours`,
        price: draft.basePrice,
        quantity: 1
      },
      ...draft.modifiers.map(modifier => ({
        item_id: modifier.id,
        item_name: modifier.name,
        item_brand: 'BoomBoxCar',
        item_category: modifier.price > 0 ? 'Add-on' : 'Included equipment',
        price: modifier.price,
        quantity: modifier.quantity
      }))
    ];
  }

  function checkoutAnalytics(draft, paymentType) {
    return {
      currency: currentPackage?.currency || 'USD',
      value: draft.total,
      coupon: draft.couponCode || undefined,
      payment_type: paymentType,
      duration_hours: draft.durationHours,
      addon_count: draft.modifiers.filter(modifier => modifier.price > 0).length,
      qr_campaign_id: campaignOffer?.id || undefined,
      new_customer_offer: Boolean(appliedCampaignOffer) || undefined,
      partner_code: partnerPass?.code || undefined,
      partner_benefit_type: partnerPass ? (partnerPass.activationAvailable ? 'activation' : 'future_rate') : undefined,
      language: draft.locale,
      items: analyticsItems(draft)
    };
  }

  function trackCheckout(eventName, draft, paymentType, extra = {}) {
    if (typeof window.fireGA !== 'function') return;
    window.fireGA(eventName, { ...checkoutAnalytics(draft, paymentType), ...extra });
  }

  function reservationPayload(draft) {
    return {
      locale: draft.locale,
      eventDate: draft.eventDate,
      startAt: draft.startAt,
      durationHours: draft.durationHours,
      modifiers: draft.modifiers.map(modifier => ({ id: modifier.id, quantity: modifier.quantity })),
      couponCode: draft.couponCode,
      address: draft.address,
      eventType: draft.eventType,
      setting: draft.setting,
      attendance: draft.attendance,
      requests: draft.requests,
      customer: draft.customer,
      partnerToken: draft.partnerToken,
      partnerPermissions: draft.partnerPermissions,
      campaignId: draft.campaignId,
      attribution: draft.attribution
    };
  }

  function cardVerificationDetails(draft) {
    return {
      amount: draft.total.toFixed(2),
      billingContact: {
        givenName: draft.customer.givenName,
        familyName: draft.customer.familyName,
        email: draft.customer.email,
        phone: draft.customer.phone,
        addressLines: [draft.address.addressLine1, draft.address.addressLine2].filter(Boolean),
        city: draft.address.locality,
        state: draft.address.administrativeDistrictLevel1,
        postalCode: draft.address.postalCode,
        countryCode: 'US'
      },
      currencyCode: currentPackage?.currency || 'USD',
      intent: 'CHARGE',
      customerInitiated: true,
      sellerKeyedIn: false
    };
  }

  async function completePayment({ draft, sourceToken, paymentMethod, errorCopy }) {
    const response = await fetch(`${apiBase}/reservations/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...reservationPayload(draft),
        sourceToken,
        paymentMethod,
        expectedTotalCents: Math.round(draft.total * 100)
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || errorCopy);
    const confirmationUrl = new URL(result.confirmationUrl);
    if (confirmationUrl.origin !== window.location.origin || confirmationUrl.pathname !== '/confirmation/') {
      throw new Error(errorCopy);
    }
    return { result, confirmationUrl };
  }

  function couponIsReady() {
    const enteredCode = couponInput?.value.trim().toUpperCase() || '';
    if (!enteredCode) return true;
    if (appliedCoupon?.code === enteredCode) return true;
    couponStatus.textContent = copy.couponNeedsApply;
    couponStatus.dataset.state = 'error';
    couponInput.focus();
    return false;
  }

  function campaignContactValue() {
    return form.elements.email.value.trim().toLowerCase();
  }

  function campaignIsReady() {
    if (!campaignOffer || appliedCampaignOffer || campaignEligibilityStatus === 'ineligible') return true;
    campaignOfferStatus.textContent = copy.campaignNeedsVerify;
    campaignOfferStatus.dataset.state = 'error';
    campaignOfferVerify.focus();
    return false;
  }

  function showIncompleteForm() {
    bookingResult.textContent = copy.incompleteForm;
    bookingResult.dataset.state = 'error';
    bookingResult.hidden = false;
  }

  function validateBeforePayment() {
    validateNotice();
    if (!form.checkValidity()) {
      showIncompleteForm();
      form.reportValidity();
      return false;
    }
    if (backendReady && !currentPackage) {
      modifierStatus.textContent = copy.modifiersLoading;
      showIncompleteForm();
      return false;
    }
    if (!validateModifierRules()) {
      showIncompleteForm();
      return false;
    }
    if (!couponIsReady() || !campaignIsReady()) {
      showIncompleteForm();
      return false;
    }
    return true;
  }

  async function applyCouponCode() {
    const duration = selectedDuration();
    const couponCode = couponInput.value.trim().toUpperCase();
    couponInput.value = couponCode;
    appliedCoupon = null;
    updateSummary();
    if (!couponCode || !duration || !currentPackage) {
      couponStatus.textContent = couponCode ? copy.modifiersLoading : copy.couponInvalid;
      couponStatus.dataset.state = 'error';
      return;
    }
    couponApplyButton.disabled = true;
    couponStatus.textContent = copy.couponApply;
    couponStatus.dataset.state = '';
    try {
      const response = await fetch(`${apiBase}/coupons/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          couponCode,
          durationHours: Number(duration.value),
          modifiers: selectedModifiers().map(modifier => ({ id: modifier.id, quantity: modifier.quantity }))
        })
      });
      const result = await response.json();
      if (!response.ok || !result.coupon) throw new Error(result.error?.message || copy.couponInvalid);
      appliedCoupon = result.coupon;
      couponStatus.textContent = copy.couponApplied(money.format(result.coupon.amount));
      couponStatus.dataset.state = 'success';
      persistBookingDraft();
      updateSummary();
    } catch (error) {
      couponStatus.textContent = error.message || copy.couponInvalid;
      couponStatus.dataset.state = 'error';
    } finally {
      couponApplyButton.disabled = false;
    }
  }

  async function initializeBackend() {
    let publicConfiguration = null;
    try {
      const response = await fetch(`${apiBase}/config`, { headers: { Accept: 'application/json' } });
      const config = await response.json();
      publicConfiguration = config;
      backendReady = response.ok && config.ready === true;
      if (Number.isFinite(Number(config.minimumNoticeHours))) minimumNoticeHours = Number(config.minimumNoticeHours);
    } catch (_) { backendReady = false; }
    await loadPackagePricing();
    const duration = selectedDuration();
    dateInput.disabled = !duration;
    await loadModifiers();
    const paymentsReady = publicConfiguration ? await initializePayments(publicConfiguration) : false;
    backendReady = backendReady && paymentsReady;
    submitButton.disabled = !backendReady;
    if (duration && dateInput.value) {
      loadAvailability({ preferredSelection: restoredTimeSelection });
      restoredTimeSelection = null;
    }
    else {
      availabilityStatus.textContent = duration
        ? (backendReady ? copy.chooseDate : copy.fallback)
        : copy.chooseDurationFirst;
      submitButton.textContent = backendReady ? copy.apiSubmit : copy.fallbackSubmit;
      handoffNote.textContent = backendReady ? copy.apiHandoff : copy.fallbackHandoff;
    }
  }

  async function initializePartnerPass() {
    if (!partnerToken) return;
    try {
      const response = await fetch(`${apiBase}/partners/${encodeURIComponent(partnerToken)}`, { headers: { Accept: 'application/json' } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || 'This Partner Pass is not available.');
      partnerPass = payload.partner;
      if (partnerPass.activationPending) throw new Error('The complimentary activation is currently being processed. Try this page again shortly.');
      if (partnerPass.activationAvailable) {
        const partnerPage = new URL('/partner/', window.location.origin);
        partnerPage.searchParams.set('pass', partnerToken);
        window.location.replace(partnerPage.href);
        return;
      }
      partnerPassPanel.hidden = false;
      partnerPassLead.textContent = partnerPass.activationAvailable
        ? `${partnerPass.name}: use the private partner page to schedule the complimentary activation.`
        : `${partnerPass.name}: receive ${partnerPass.futureDiscountPercent}% off this booking and eligible add-ons.`;
      const venueAddress = partnerPass.venueAddress;
      for (const field of ['addressLine1', 'addressLine2', 'locality', 'administrativeDistrictLevel1', 'postalCode']) {
        const control = form.elements[field];
        control.value = venueAddress[field] || '';
        if (control.tagName === 'SELECT') control.disabled = true;
        else control.readOnly = true;
      }
      persistBookingDraft();
      if (!partnerPass.activationAvailable) {
        const items = [
          `${partnerPass.futureDiscountPercent}% off eligible BoomBoxCar durations and add-ons`,
          `Valid for events at ${partnerPass.formattedVenueAddress}`,
          'Cannot be combined with coupons or other offers',
          'Subject to availability and DMV service-area requirements'
        ];
        partnerPassPanel.querySelector('ul').replaceChildren(...items.map(value => {
          const item = document.createElement('li'); item.textContent = value; return item;
        }));
      }
      partnerTerms.hidden = !partnerPass.activationAvailable;
      partnerTerms.querySelectorAll('input[type="checkbox"]').forEach(input => { input.required = partnerPass.activationAvailable; });
      couponToggle.hidden = true; couponPanel.hidden = true; couponInput.value = ''; appliedCoupon = null;
      form.querySelectorAll('input[name="duration"]').forEach(input => {
        const eligible = !partnerPass.activationAvailable || partnerPass.eligibleDurations.includes(Number(input.value));
        input.disabled = !eligible;
        input.closest('.choice-card').hidden = !eligible;
        if (partnerPass.activationAvailable) input.checked = Number(input.value) === 2;
      });
      if (typeof window.fireGA === 'function') window.fireGA('partner_pass_view', {
        partner_code: partnerPass.code,
        partner_benefit_type: partnerPass.activationAvailable ? 'activation' : 'future_rate',
        max_hours: partnerPass.maxHours,
        language: apiLocale
      });
      updateSummary();
    } catch (error) {
      bookingResult.textContent = error.message;
      bookingResult.dataset.state = 'error'; bookingResult.hidden = false;
      form.querySelectorAll('input,select,textarea,button').forEach(control => { control.disabled = true; });
    }
  }

  async function initializeCampaignOffer() {
    const campaignId = attribution.qrCampaignId;
    if (!campaignId || partnerToken) return;
    try {
      const response = await fetch(`${apiBase}/campaigns/${encodeURIComponent(campaignId)}`, { headers: { Accept: 'application/json' } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || 'This event offer is not available.');
      campaignOffer = payload.campaign;
      campaignEligibilityStatus = 'pending';
      campaignOfferTitle.textContent = isSpanish
        ? `Clientes nuevos ahorran ${campaignOffer.discountPercent}%`
        : `New customers save ${campaignOffer.discountPercent}%`;
      campaignOfferVerify.textContent = isSpanish
        ? `Verificar mi oferta de ${campaignOffer.discountPercent}%`
        : `Verify my ${campaignOffer.discountPercent}% offer`;
      const endDate = new Date(`${campaignOffer.endsOn}T23:59:59`);
      const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / 86_400_000));
      const formattedEnd = new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric', year: 'numeric' }).format(endDate);
      campaignOfferDetails.textContent = isSpanish
        ? `Reserva antes del ${formattedEnd}. Quedan ${daysRemaining} día${daysRemaining === 1 ? '' : 's'}. El estimado incluye ${campaignOffer.discountPercent}% de descuento mientras verificamos tu correo.`
        : `Book by ${formattedEnd}. ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining. Your estimate includes ${campaignOffer.discountPercent}% off while we verify your email.`;
      campaignOfferPanel.hidden = false;
      couponToggle.hidden = true;
      couponPanel.hidden = true;
      campaignOfferStatus.textContent = isSpanish
        ? `El descuento estimado está pendiente. Ingresa tu correo abajo y verifica la oferta antes de pagar.`
        : `The estimated discount is pending. Enter your email below and verify the offer before checkout.`;
      updateSummary();
      if (typeof window.fireGA === 'function') window.fireGA('event_qr_offer_view', {
        qr_campaign_id: campaignOffer.id,
        discount_percent: campaignOffer.discountPercent,
        offer_ends_on: campaignOffer.endsOn,
        language: apiLocale
      });
    } catch (error) {
      campaignOfferPanel.hidden = false;
      campaignOfferStatus.textContent = error.message;
      campaignOfferStatus.dataset.state = 'error';
      campaignOfferVerify.hidden = true;
    }
  }

  async function verifyCampaignOffer() {
    if (!campaignOffer) return;
    const email = form.elements.email;
    if (!email.checkValidity()) { email.reportValidity(); email.focus(); return; }
    campaignOfferVerify.disabled = true;
    campaignOfferStatus.textContent = isSpanish ? 'Verificando con Square…' : 'Verifying with Square…';
    campaignOfferStatus.dataset.state = '';
    try {
      const response = await fetch(`${apiBase}/campaigns/${encodeURIComponent(campaignOffer.id)}/eligibility`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.value.trim() })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || copy.campaignNotEligible);
      if (!payload.eligible) {
        appliedCampaignOffer = null;
        campaignEligibilityStatus = 'ineligible';
        verifiedCampaignContact = campaignContactValue();
        campaignOfferStatus.textContent = isSpanish
          ? 'Este correo pertenece a un cliente existente. Se muestra el precio normal y puedes continuar con la reserva.'
          : 'This email belongs to an existing customer. Standard pricing is now shown and you may continue booking.';
        campaignOfferStatus.dataset.state = 'error';
        campaignOfferVerify.textContent = isSpanish ? 'Precio de cliente existente' : 'Existing customer pricing';
        updateSummary();
        if (squarePayments) await resetDigitalWallet();
        return;
      }
      appliedCampaignOffer = { type: 'PERCENT', value: campaignOffer.discountPercent, code: campaignOffer.id };
      campaignEligibilityStatus = 'eligible';
      verifiedCampaignContact = campaignContactValue();
      campaignOfferStatus.textContent = copy.campaignReady(campaignOffer.discountPercent);
      campaignOfferStatus.dataset.state = 'success';
      campaignOfferVerify.textContent = isSpanish ? 'Oferta aplicada' : 'Offer applied';
      if (typeof window.fireGA === 'function') window.fireGA('event_qr_offer_verified', {
        qr_campaign_id: campaignOffer.id, discount_percent: campaignOffer.discountPercent, language: apiLocale
      });
      updateSummary();
      if (squarePayments) await resetDigitalWallet();
    } catch (error) {
      appliedCampaignOffer = null;
      campaignEligibilityStatus = 'pending';
      verifiedCampaignContact = '';
      campaignOfferStatus.textContent = error.message || copy.campaignNotEligible;
      campaignOfferStatus.dataset.state = 'error';
    } finally {
      campaignOfferVerify.disabled = false;
    }
  }

  form.addEventListener('input', event => {
    if (event.target.name === 'modifiers' || event.target.dataset.modifierQuantity) modifierStatus.dataset.state = '';
    if (bookingDraftFieldNames.has(event.target.name)) scheduleBookingDraftSave();
    if (event.target === couponInput && appliedCoupon?.code !== couponInput.value.trim().toUpperCase()) {
      appliedCoupon = null;
      couponStatus.textContent = '';
      couponStatus.dataset.state = '';
    }
    if (campaignOffer && event.target === form.elements.email && campaignContactValue() !== verifiedCampaignContact) {
      appliedCampaignOffer = null;
      campaignEligibilityStatus = 'pending';
      verifiedCampaignContact = '';
      campaignOfferStatus.textContent = copy.campaignNeedsVerify;
      campaignOfferStatus.dataset.state = 'error';
      campaignOfferVerify.textContent = isSpanish
        ? `Verificar mi oferta de ${campaignOffer.discountPercent}%`
        : `Verify my ${campaignOffer.discountPercent}% offer`;
    }
    validateNotice();
    updateSummary();
    if (partnerPass && (event.target.name === 'modifiers' || event.target.dataset.modifierQuantity) && squarePayments) void resetDigitalWallet();
  });
  couponToggle?.addEventListener('click', () => {
    couponPanel.hidden = !couponPanel.hidden;
    couponToggle.setAttribute('aria-expanded', String(!couponPanel.hidden));
    if (!couponPanel.hidden) couponInput.focus();
  });
  couponApplyButton?.addEventListener('click', applyCouponCode);
  campaignOfferVerify?.addEventListener('click', verifyCampaignOffer);
  cardPaymentToggle?.addEventListener('click', showCardCheckout);
  couponInput?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyCouponCode();
    }
  });
  form.addEventListener('change', event => {
    if (bookingDraftFieldNames.has(event.target.name)) scheduleBookingDraftSave();
    validateNotice();
    updateSummary();
    if (event.target === dateInput) loadAvailability();
    if (event.target.name === 'duration') {
      const duration = selectedDuration();
      if (duration && typeof window.fireGA === 'function') {
        const hours = Number(duration.value);
        const price = Number(duration.dataset.price);
        window.fireGA('select_item', {
          currency: currentPackage?.currency || 'USD',
          value: price,
          item_list_id: 'booking_packages',
          item_list_name: 'Booking packages',
          language: apiLocale,
          items: [{
            item_id: `boomboxcar_${hours}h`,
            item_name: `${hours}-hour BoomBoxCar booking`,
            item_brand: 'BoomBoxCar',
            item_category: 'Event service',
            item_variant: `${hours} hours`,
            price,
            quantity: 1
          }]
        });
      }
      dateInput.disabled = false;
      loadAvailability({ preserveSelection: true });
      void loadModifiers().then(() => {
        if (squarePayments && !applePay && !googlePay) void resetDigitalWallet();
      });
    }
  });

  function setDigitalWalletsDisabled(disabled) {
    applePayButton.disabled = disabled;
    googlePayButton.dataset.disabled = String(disabled);
    googlePayButton.setAttribute('aria-disabled', String(disabled));
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!validateBeforePayment()) return;
    const draft = buildDraft();
    persistBookingDraft();
    trackCheckout('begin_checkout', draft, 'card');

    if (!backendReady || !cardReady || !cardPayment || !draft.startAt) {
      bookingResult.textContent = copy.paymentUnavailable;
      bookingResult.dataset.state = 'error';
      bookingResult.hidden = false;
      return;
    }
    if (Math.round(draft.total * 100) < 1) {
      bookingResult.textContent = copy.couponExceedsTotal;
      bookingResult.dataset.state = 'error';
      bookingResult.hidden = false;
      return;
    }

    submitButton.disabled = true;
    setDigitalWalletsDisabled(true);
    submitButton.textContent = copy.submitting;
    bookingResult.textContent = copy.submitting;
    bookingResult.dataset.state = '';
    bookingResult.hidden = false;
    try {
      const tokenResult = await cardPayment.tokenize(cardVerificationDetails(draft));
      if (tokenResult.status !== 'OK' || !tokenResult.token) throw new Error(copy.cardError);
      trackCheckout('add_payment_info', draft, 'card');
      const { result, confirmationUrl } = await completePayment({
        draft,
        sourceToken: tokenResult.token,
        paymentMethod: 'card',
        errorCopy: copy.cardError
      });
      bookingResult.textContent = copy.paymentReady;
      bookingResult.dataset.state = 'success';
      handoffNote.hidden = true;
      trackCheckout('card_booking_completed', draft, 'card', {
        reservation_id: result.reservationId,
        order_id: result.orderId || ''
      });
      window.location.assign(confirmationUrl.href);
    } catch (error) {
      trackCheckout('payment_error', draft, 'card', { checkout_stage: 'payment' });
      bookingResult.textContent = error.message || copy.cardError;
      bookingResult.dataset.state = 'error';
      submitButton.disabled = !cardReady;
      submitButton.textContent = copy.apiSubmit;
      setDigitalWalletsDisabled(false);
      loadAvailability({ preserveSelection: true });
    }
  });

  async function processDigitalWalletPayment({ payment, paymentMethod, processingCopy, readyCopy, errorCopy, analyticsEvent }) {
    if (!validateBeforePayment() || !payment) return;
    const draft = buildDraft();
    if (!draft.startAt) return;
    trackCheckout('begin_checkout', draft, paymentMethod);
    const expectedTotalCents = Math.round(draft.total * 100);
    if (expectedTotalCents < 1) {
      bookingResult.textContent = copy.couponExceedsTotal;
      bookingResult.dataset.state = 'error';
      bookingResult.hidden = false;
      return;
    }
    persistBookingDraft();

    let tokenization;
    try {
      tokenization = payment.tokenize();
    } catch (_) {
      bookingResult.textContent = errorCopy;
      bookingResult.dataset.state = 'error';
      bookingResult.hidden = false;
      await resetDigitalWallet();
      return;
    }
    setDigitalWalletsDisabled(true);
    submitButton.disabled = true;
    bookingResult.textContent = processingCopy;
    bookingResult.dataset.state = '';
    bookingResult.hidden = false;
    try {
      const tokenResult = await tokenization;
      if (tokenResult.status !== 'OK' || !tokenResult.token) throw new Error(errorCopy);
      trackCheckout('add_payment_info', draft, paymentMethod);
      const { result, confirmationUrl } = await completePayment({
        draft,
        sourceToken: tokenResult.token,
        paymentMethod,
        errorCopy
      });
      bookingResult.textContent = readyCopy;
      bookingResult.dataset.state = 'success';
      handoffNote.hidden = true;
      trackCheckout(analyticsEvent, draft, paymentMethod, {
        reservation_id: result.reservationId,
        order_id: result.orderId || ''
      });
      window.location.assign(confirmationUrl.href);
    } catch (error) {
      trackCheckout('payment_error', draft, paymentMethod, { checkout_stage: 'payment' });
      bookingResult.textContent = error.message || errorCopy;
      bookingResult.dataset.state = 'error';
      bookingResult.hidden = false;
      await resetDigitalWallet();
      setDigitalWalletsDisabled(false);
      submitButton.disabled = !cardReady;
      loadAvailability({ preserveSelection: true });
    }
  }

  applePayButton?.addEventListener('click', event => {
    event.preventDefault();
    void processDigitalWalletPayment({
      payment: applePay,
      paymentMethod: 'applePay',
      processingCopy: copy.applePayProcessing,
      readyCopy: copy.applePayReady,
      errorCopy: copy.applePayError,
      analyticsEvent: 'apple_pay_booking_completed'
    });
  });

  googlePayButton?.addEventListener('click', event => {
    event.preventDefault();
    if (googlePayButton.dataset.disabled === 'true') return;
    void processDigitalWalletPayment({
      payment: googlePay,
      paymentMethod: 'googlePay',
      processingCopy: copy.googlePayProcessing,
      readyCopy: copy.googlePayReady,
      errorCopy: copy.googlePayError,
      analyticsEvent: 'google_pay_booking_completed'
    });
  });

  partnerReserveButton?.addEventListener('click', async () => {
    if (!partnerPass || !validateBeforePayment()) return;
    const draft = buildDraft();
    if (Math.round(draft.total * 100) !== 0 || !draft.startAt) return;
    partnerReserveButton.disabled = true;
    bookingResult.textContent = isSpanish ? 'Reservando tu activación…' : 'Reserving your activation…';
    bookingResult.dataset.state = ''; bookingResult.hidden = false;
    if (typeof window.fireGA === 'function') window.fireGA('partner_pass_begin_checkout', { partner_code: partnerPass.code, duration_hours: draft.durationHours, event_type: draft.eventType });
    try {
      const response = await fetch(`${apiBase}/partners/${encodeURIComponent(partnerToken)}/reservations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reservationPayload(draft))
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || copy.error);
      const confirmationUrl = new URL(result.confirmationUrl);
      if (confirmationUrl.origin !== window.location.origin || confirmationUrl.pathname !== '/confirmation/') throw new Error(copy.error);
      sessionStorage.removeItem('boomboxcarPartnerPassToken.v1');
      window.location.assign(confirmationUrl.href);
    } catch (error) {
      bookingResult.textContent = error.message || copy.error; bookingResult.dataset.state = 'error';
      partnerReserveButton.disabled = false; loadAvailability({ preserveSelection: true });
    }
  });

  restoreBookingDraft();
  updateSummary();
  void Promise.all([initializePartnerPass(), initializeCampaignOffer()]).then(initializeBackend);
})();
