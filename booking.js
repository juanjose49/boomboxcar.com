(() => {
  const form = document.getElementById('bookingBuilder');
  if (!form) return;

  const apiBase = '/api';
  const squareBookingUrl = 'https://app.squareup.com/appointments/book/pz9p8fdxiu4g9w/LX5ZE0BPJR0HS/start';
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
    fallback: 'La API aún no está disponible. Elige una hora y confirmarás la disponibilidad en el programador de Square.',
    apiSubmit: 'Continuar al pago de Square', fallbackSubmit: 'Copiar detalles y continuar a Square',
    apiHandoff: 'La dirección del evento se guardará como el lugar de la cita. Square completará tus datos de contacto para el pago. Completa el pago en 30 minutos para conservar la hora.',
    fallbackHandoff: 'Tus detalles se copiarán. Pégalos en las notas de la cita en Square para conservar todos los extras.',
    submitting: 'Conectando con Square…', checkoutReady: 'Reserva creada. Abriendo el pago de Square…',
    applePayProcessing: 'Procesando Apple Pay de forma segura…', applePayReady: 'Pago completado. Abriendo tu confirmación…',
    applePayError: 'Apple Pay no pudo completar el pago. Inténtalo de nuevo o usa el pago de Square.',
    couponApply: 'Aplicando cupón…', couponApplied: amount => `Cupón aplicado: −${amount}`,
    couponInvalid: 'Ese código de cupón no es válido.', couponNeedsApply: 'Aplica el código de cupón antes de continuar.',
    couponExceedsTotal: 'El cupón debe dejar al menos $0.01 por pagar.',
    couponLabel: code => `Cupón ${code}`,
    checkoutReturn: 'Square Checkout te regresó a BoomBoxCar para la reserva',
    error: 'No pudimos crear la reserva. Revisa los datos o elige otra hora.',
    modifiersLoading: 'Cargando los extras configurados en Square…', noModifiers: 'No hay extras disponibles para este paquete.',
    modifiersUnavailable: 'Los extras se seleccionarán en el programador de Square.', optional: 'Opcional',
    required: 'Requerido', upTo: 'Hasta', selections: 'selecciones', quantity: 'Cantidad',
    invalidModifiers: 'Revisa la cantidad de extras seleccionados.',
    includedLabel: 'Incluido en cada reserva',
    includedItems: 'Dos bocinas potentes, el BoomBox inflable, dos micrófonos inalámbricos y música ambiental con licencia a través de Soundtrack Your Brand.',
    staffScope: 'El personal instala y opera el sistema de sonido. Los servicios de DJ y maestro de ceremonias no están incluidos; tu equipo controla los anuncios, la programación y el mensaje del evento.'
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
    fallback: 'The API is not available yet. Choose a time and confirm availability in the hosted Square scheduler.',
    apiSubmit: 'Continue to Square Checkout', fallbackSubmit: 'Copy details & continue to Square',
    apiHandoff: 'Your event address will be saved as the appointment location. Square will prefill your contact details for payment. Complete payment within 30 minutes to keep the time.',
    fallbackHandoff: 'Your details will be copied. Paste them into Square’s appointment notes to preserve every add-on.',
    submitting: 'Connecting to Square…', checkoutReady: 'Reservation created. Opening Square Checkout…',
    applePayProcessing: 'Securely processing Apple Pay…', applePayReady: 'Payment complete. Opening your confirmation…',
    applePayError: 'Apple Pay could not complete the payment. Try again or use Square Checkout.',
    couponApply: 'Applying coupon…', couponApplied: amount => `Coupon applied: −${amount}`,
    couponInvalid: 'That coupon code is not valid.', couponNeedsApply: 'Apply the coupon code before continuing.',
    couponExceedsTotal: 'The coupon must leave at least $0.01 due for payment.',
    couponLabel: code => `Coupon ${code}`,
    checkoutReturn: 'Square Checkout returned you to BoomBoxCar for reservation',
    error: 'We could not create the reservation. Check the details or choose another time.',
    modifiersLoading: 'Loading your Square add-ons…', noModifiers: 'No add-ons are available for this package.',
    modifiersUnavailable: 'Add-ons will be selected in the hosted Square scheduler.', optional: 'Optional',
    required: 'Required', upTo: 'Up to', selections: 'selections', quantity: 'Quantity',
    invalidModifiers: 'Review the number of add-ons selected.',
    includedLabel: 'Included with every booking',
    includedItems: 'Two powerful speakers, the inflatable BoomBox, two wireless microphones, and licensed background music through Soundtrack Your Brand.',
    staffScope: 'Staff set up and operate the sound system. DJ and MC services are not included; your team controls announcements, programming, and the event message.'
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
  const couponToggle = document.getElementById('couponToggle');
  const couponPanel = document.getElementById('couponPanel');
  const couponInput = document.getElementById('couponCode');
  const couponApplyButton = document.getElementById('couponApply');
  const couponStatus = document.getElementById('couponStatus');
  const handoffNote = document.getElementById('handoffNote');
  const bookingResult = document.getElementById('bookingResult');
  const modifierGroups = document.getElementById('modifierGroups');
  const modifierStatus = document.getElementById('modifierStatus');
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  let backendReady = false;
  let availabilityController = null;
  let modifierController = null;
  let currentPackage = null;
  let squarePayments = null;
  let applePay = null;
  let applePayRequest = null;
  let appliedCoupon = null;
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

  const checkoutParams = new URLSearchParams(window.location.search);
  const returnedReservationId = checkoutParams.get('reservation') || '';
  if (checkoutParams.get('checkout') === 'complete' && /^BBC-\d{4}-[A-F0-9]{6}$/.test(returnedReservationId)) {
    bookingResult.textContent = `${copy.checkoutReturn} ${returnedReservationId}.`;
    bookingResult.dataset.state = 'success';
    bookingResult.hidden = false;
  }

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
        const card = document.createElement('span');
        const name = document.createElement('strong');
        name.textContent = modifier.name;
        const price = document.createElement('small');
        price.textContent = modifier.price ? `+${money.format(modifier.price)}` : money.format(0);
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
      updateApplePayRequest();
      return;
    }
    const hours = Number(duration.value);
    const basePrice = Number(duration.dataset.price);
    const modifiers = selectedModifiers();
    const subtotal = modifiers.reduce((sum, modifier) => sum + modifier.price * modifier.quantity, basePrice);
    const discountAmount = couponDiscountAmount(subtotal);
    const total = subtotal - discountAmount;

    if (appliedCoupon && couponStatus.dataset.state === 'success') {
      couponStatus.textContent = copy.couponApplied(money.format(discountAmount));
    }

    packageOutput.textContent = `${hours} ${hours === 1 ? copy.hour : copy.hours}`;
    totalOutput.textContent = money.format(total);
    quoteNote.hidden = true;
    const lines = [{ label: copy.base, price: basePrice }, ...modifiers.map(modifier => ({
      label: `${modifier.name}${modifier.quantity > 1 ? ` × ${modifier.quantity}` : ''}`,
      price: modifier.price * modifier.quantity
    })), ...(appliedCoupon ? [{ label: copy.couponLabel(appliedCoupon.code), price: -discountAmount }] : [])];
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
    updateApplePayRequest();
  }

  function couponDiscountAmount(subtotal) {
    if (!appliedCoupon) return 0;
    const subtotalCents = Math.round(subtotal * 100);
    const discountCents = appliedCoupon.type === 'PERCENT'
      ? appliedCoupon.value === 100 ? subtotalCents - 1 : Math.round(subtotalCents * appliedCoupon.value / 100)
      : Math.round(appliedCoupon.value * 100);
    return Math.min(subtotalCents, Math.max(0, discountCents)) / 100;
  }

  function paymentRequestDetails() {
    const duration = selectedDuration();
    if (!duration) return null;
    const modifiers = selectedModifiers();
    const basePrice = Number(duration.dataset.price);
    const subtotal = modifiers.reduce((sum, modifier) => sum + modifier.price * modifier.quantity, basePrice);
    const discountAmount = couponDiscountAmount(subtotal);
    const total = subtotal - discountAmount;
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
        ...(appliedCoupon ? [{ label: copy.couponLabel(appliedCoupon.code), amount: `-${discountAmount.toFixed(2)}` }] : [])
      ],
      total: { label: 'BoomBoxCar', amount: total.toFixed(2) }
    };
  }

  function updateApplePayRequest() {
    const details = paymentRequestDetails();
    if (!applePayRequest || !details) return;
    try { applePayRequest.update(details); } catch (_) {}
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

  async function initializeApplePay(config) {
    if (!applePayButton || !config.applePayReady || !window.isSecureContext) return;
    const details = paymentRequestDetails();
    if (!details) return;
    try {
      await loadSquareSdk(config.webPaymentsSdkUrl);
      squarePayments = window.Square.payments(config.applicationId, config.locationId);
      await resetApplePay();
    } catch (_) {
      squarePayments = null;
      applePayRequest = null;
      applePay = null;
      applePayButton.hidden = true;
    }
  }

  async function resetApplePay() {
    const previousApplePay = applePay;
    applePay = null;
    applePayRequest = null;
    if (previousApplePay) {
      try { await previousApplePay.destroy(); } catch (_) {}
    }
    const details = paymentRequestDetails();
    if (!squarePayments || !details) return false;
    try {
      applePayRequest = squarePayments.paymentRequest(details);
      applePay = await squarePayments.applePay(applePayRequest);
      applePayButton.hidden = false;
      return true;
    } catch (_) {
      applePayRequest = null;
      applePay = null;
      applePayButton.hidden = true;
      return false;
    }
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
    const discountAmount = couponDiscountAmount(subtotal);
    return {
      locale: apiLocale,
      eventDate: dateInput.value,
      eventTime: timeInput.value,
      startAt: selectedStartAt(),
      durationHours: Number(duration.value),
      basePrice,
      modifiers,
      couponCode: appliedCoupon?.code || '',
      discount: appliedCoupon ? { ...appliedCoupon, amount: discountAmount } : null,
      total: subtotal - discountAmount,
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
      }
    };
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
      customer: draft.customer
    };
  }

  function buildSquareNote(draft) {
    const date = draft.startAt ? new Date(draft.startAt) : new Date(`${draft.eventDate}T${draft.eventTime}`);
    const formattedDate = new Intl.DateTimeFormat(locale, {
      timeZone: draft.startAt ? 'America/New_York' : undefined,
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
    }).format(date);
    const addonLines = draft.modifiers.length
      ? draft.modifiers.map(modifier => `- ${modifier.name}${modifier.quantity > 1 ? ` × ${modifier.quantity}` : ''}: +${money.format(modifier.price * modifier.quantity)}`).join('\n')
      : `- ${copy.none}`;
    const eventAddress = [draft.address.addressLine1, draft.address.addressLine2, draft.address.locality,
      `${draft.address.administrativeDistrictLevel1} ${draft.address.postalCode}`].filter(Boolean).join(', ');
    return [copy.noteTitle, `${copy.date}: ${formattedDate}`, `${copy.duration}: ${draft.durationHours} ${draft.durationHours === 1 ? copy.hour : copy.hours} (${money.format(draft.basePrice)})`, `${copy.includedLabel}: ${copy.includedItems}`, copy.staffScope, `${copy.addons}:`, addonLines, ...(draft.discount ? [`${copy.couponLabel(draft.discount.code)}: -${money.format(draft.discount.amount)}`] : []), `${copy.estimatedTotal}: ${money.format(draft.total)}`, `${copy.address}: ${eventAddress}`, `${copy.eventType}: ${draft.eventType}`, `${copy.setting}: ${draft.setting}`, `${copy.attendance}: ${draft.attendance}`, `${copy.requests}: ${draft.requests || copy.none}`].join('\n');
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

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (_) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      return copied;
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
    if (publicConfiguration) await initializeApplePay(publicConfiguration);
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

  form.addEventListener('input', event => {
    if (event.target.name === 'modifiers' || event.target.dataset.modifierQuantity) modifierStatus.dataset.state = '';
    if (bookingDraftFieldNames.has(event.target.name)) scheduleBookingDraftSave();
    if (event.target === couponInput && appliedCoupon?.code !== couponInput.value.trim().toUpperCase()) {
      appliedCoupon = null;
      couponStatus.textContent = '';
      couponStatus.dataset.state = '';
    }
    validateNotice();
    updateSummary();
  });
  couponToggle?.addEventListener('click', () => {
    couponPanel.hidden = !couponPanel.hidden;
    couponToggle.setAttribute('aria-expanded', String(!couponPanel.hidden));
    if (!couponPanel.hidden) couponInput.focus();
  });
  couponApplyButton?.addEventListener('click', applyCouponCode);
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
      dateInput.disabled = false;
      loadAvailability({ preserveSelection: true });
      loadModifiers();
    }
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    validateNotice();
    if (!form.reportValidity()) return;
    if (backendReady && !currentPackage) {
      modifierStatus.textContent = copy.modifiersLoading;
      return;
    }
    if (!validateModifierRules()) return;
    if (!couponIsReady()) return;
    const draft = buildDraft();
    const squareNote = buildSquareNote(draft);
    persistBookingDraft();

    if (!backendReady || !draft.startAt) {
      const detailsCopied = await copyText(squareNote);
      if (typeof fireGA === 'function') fireGA('square_availability_handoff', { duration_hours: draft.durationHours, addon_count: draft.modifiers.length, event_type: draft.eventType, details_copied: detailsCopied, lang: document.documentElement.lang || 'en' });
      window.location.href = squareBookingUrl;
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = copy.submitting;
    bookingResult.hidden = true;
    try {
      const response = await fetch(`${apiBase}/reservations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reservationPayload(draft))
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || copy.error);
      const checkoutUrl = new URL(result.checkoutUrl);
      if (checkoutUrl.protocol !== 'https:' || !['square.link', 'sandbox.square.link'].includes(checkoutUrl.hostname)) throw new Error(copy.error);
      bookingResult.textContent = copy.checkoutReady;
      bookingResult.dataset.state = 'success';
      bookingResult.hidden = false;
      handoffNote.hidden = true;
      if (typeof fireGA === 'function') fireGA('booking_created', { reservation_id: result.reservationId, duration_hours: draft.durationHours, addon_count: draft.modifiers.length, order_id: result.orderId || '', lang: document.documentElement.lang || 'en' });
      window.location.assign(checkoutUrl.href);
    } catch (error) {
      bookingResult.textContent = error.message || copy.error;
      bookingResult.dataset.state = 'error';
      bookingResult.hidden = false;
      submitButton.disabled = false;
      submitButton.textContent = copy.apiSubmit;
      loadAvailability({ preserveSelection: true });
    }
  });

  applePayButton?.addEventListener('click', async event => {
    event.preventDefault();
    validateNotice();
    if (!form.reportValidity() || !applePay) return;
    if (backendReady && !currentPackage) {
      modifierStatus.textContent = copy.modifiersLoading;
      return;
    }
    if (!validateModifierRules()) return;
    if (!couponIsReady()) return;
    const draft = buildDraft();
    if (!draft.startAt) return;
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
      tokenization = applePay.tokenize();
    } catch (_) {
      bookingResult.textContent = copy.applePayError;
      bookingResult.dataset.state = 'error';
      bookingResult.hidden = false;
      await resetApplePay();
      return;
    }
    applePayButton.disabled = true;
    submitButton.disabled = true;
    bookingResult.textContent = copy.applePayProcessing;
    bookingResult.dataset.state = '';
    bookingResult.hidden = false;
    try {
      const tokenResult = await tokenization;
      if (tokenResult.status !== 'OK' || !tokenResult.token) throw new Error(copy.applePayError);
      const response = await fetch(`${apiBase}/reservations/apple-pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...reservationPayload(draft),
          sourceToken: tokenResult.token,
          expectedTotalCents
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || copy.applePayError);
      const confirmationUrl = new URL(result.confirmationUrl);
      if (confirmationUrl.origin !== window.location.origin || confirmationUrl.pathname !== '/confirmation/') {
        throw new Error(copy.applePayError);
      }
      bookingResult.textContent = copy.applePayReady;
      bookingResult.dataset.state = 'success';
      handoffNote.hidden = true;
      if (typeof fireGA === 'function') fireGA('apple_pay_booking_completed', {
        reservation_id: result.reservationId,
        duration_hours: draft.durationHours,
        addon_count: draft.modifiers.length,
        order_id: result.orderId || '',
        lang: document.documentElement.lang || 'en'
      });
      window.location.assign(confirmationUrl.href);
    } catch (error) {
      bookingResult.textContent = error.message || copy.applePayError;
      bookingResult.dataset.state = 'error';
      bookingResult.hidden = false;
      const applePayReset = await resetApplePay();
      applePayButton.disabled = !applePayReset;
      submitButton.disabled = false;
      loadAvailability({ preserveSelection: true });
    }
  });

  restoreBookingDraft();
  updateSummary();
  initializeBackend();
})();
