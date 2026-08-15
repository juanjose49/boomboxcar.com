(() => {
  const form = document.getElementById('bookingBuilder');
  if (!form) return;

  const apiBase = '/api';
  const squareBookingUrl = 'https://app.squareup.com/appointments/book/pz9p8fdxiu4g9w/LX5ZE0BPJR0HS/start';
  const isSpanish = (form.dataset.locale || document.documentElement.lang).toLowerCase().startsWith('es');
  const locale = isSpanish ? 'es-US' : 'en-US';
  const apiLocale = isSpanish ? 'es' : 'en';
  const copy = isSpanish ? {
    chooseDate: 'Elige una fecha y hora de llegada', hour: 'hora', hours: 'horas', base: 'Servicio base',
    notice: 'La fecha y hora deben tener al menos 18 horas de antelación.', noteTitle: 'DETALLES DE BOOMBOXCAR',
    date: 'Fecha y hora', duration: 'Duración', addons: 'Extras', none: 'Ninguno', address: 'Dirección',
    eventType: 'Tipo de evento', setting: 'Entorno', attendance: 'Asistencia esperada', requests: 'Solicitudes especiales',
    estimatedTotal: 'Total estimado', customQuote: 'cotización personalizada', chooseDateFirst: 'Elige una fecha primero',
    chooseTime: 'Elige una hora de llegada', loading: 'Consultando la disponibilidad de Square…',
    liveReady: 'Estas horas están disponibles actualmente en Square.', noSlots: 'No hay horas disponibles para esta fecha y duración.',
    fallback: 'La API aún no está disponible. Elige una hora y confirmarás la disponibilidad en el programador de Square.',
    apiSubmit: 'Reservar BoomBoxCar', fallbackSubmit: 'Copiar detalles y continuar a Square',
    apiHandoff: 'Tu reserva se creará directamente en Square con todos los extras y detalles.',
    fallbackHandoff: 'Tus detalles se copiarán. Pégalos en las notas de la cita en Square para conservar todos los extras.',
    submitting: 'Creando tu reserva segura…', successTitle: 'Reserva creada', successBody: 'Tu número de reserva es',
    error: 'No pudimos crear la reserva. Revisa los datos o elige otra hora.',
    modifiersLoading: 'Cargando los extras configurados en Square…', noModifiers: 'No hay extras disponibles para este paquete.',
    modifiersUnavailable: 'Los extras se seleccionarán en el programador de Square.', optional: 'Opcional',
    required: 'Requerido', upTo: 'Hasta', selections: 'selecciones', quantity: 'Cantidad',
    invalidModifiers: 'Revisa la cantidad de extras seleccionados.',
    orderWarning: 'La cita está confirmada, pero el pedido detallado de Square necesita revisión.',
    includedLabel: 'Incluido en cada reserva',
    includedItems: 'Dos bocinas potentes, el BoomBox inflable, dos micrófonos inalámbricos y música ambiental con licencia a través de Soundtrack Your Brand.',
    staffScope: 'El personal instala y opera el sistema de sonido. Los servicios de DJ y maestro de ceremonias no están incluidos; tu equipo controla los anuncios, la programación y el mensaje del evento.'
  } : {
    chooseDate: 'Choose a date and arrival time', hour: 'hour', hours: 'hours', base: 'Base service',
    notice: 'Date and time must be at least 18 hours from now.', noteTitle: 'BOOMBOXCAR EVENT DETAILS',
    date: 'Date and time', duration: 'Duration', addons: 'Add-ons', none: 'None', address: 'Address',
    eventType: 'Event type', setting: 'Setting', attendance: 'Expected attendance', requests: 'Special requests',
    estimatedTotal: 'Estimated total', customQuote: 'custom quote', chooseDateFirst: 'Choose a date first',
    chooseTime: 'Choose an arrival time', loading: 'Checking live Square availability…',
    liveReady: 'These times are currently available in Square.', noSlots: 'No arrival times are available for this date and duration.',
    fallback: 'The API is not available yet. Choose a time and confirm availability in the hosted Square scheduler.',
    apiSubmit: 'Reserve BoomBoxCar', fallbackSubmit: 'Copy details & continue to Square',
    apiHandoff: 'Your reservation will be created directly in Square with every add-on and event detail.',
    fallbackHandoff: 'Your details will be copied. Paste them into Square’s appointment notes to preserve every add-on.',
    submitting: 'Creating your secure reservation…', successTitle: 'Reservation created', successBody: 'Your reservation number is',
    error: 'We could not create the reservation. Check the details or choose another time.',
    modifiersLoading: 'Loading your Square add-ons…', noModifiers: 'No add-ons are available for this package.',
    modifiersUnavailable: 'Add-ons will be selected in the hosted Square scheduler.', optional: 'Optional',
    required: 'Required', upTo: 'Up to', selections: 'selections', quantity: 'Quantity',
    invalidModifiers: 'Review the number of add-ons selected.',
    orderWarning: 'The appointment is confirmed, but its itemized Square order needs review.',
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
  const handoffNote = document.getElementById('handoffNote');
  const bookingResult = document.getElementById('bookingResult');
  const modifierGroups = document.getElementById('modifierGroups');
  const modifierStatus = document.getElementById('modifierStatus');
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  let backendReady = false;
  let availabilityController = null;
  let modifierController = null;
  let currentPackage = null;

  function localDateValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  dateInput.min = localDateValue(new Date());

  function selectedDuration() {
    return form.querySelector('input[name="duration"]:checked');
  }

  function selectedStartAt() {
    return timeInput.selectedOptions[0]?.dataset.startAt || '';
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

  async function loadModifiers() {
    modifierController?.abort();
    currentPackage = null;
    modifierGroups.replaceChildren();
    if (!backendReady) {
      modifierStatus.textContent = copy.modifiersUnavailable;
      updateSummary();
      return;
    }
    modifierController = new AbortController();
    modifierStatus.textContent = copy.modifiersLoading;
    try {
      const duration = selectedDuration();
      const response = await fetch(`${apiBase}/modifiers?durationHours=${encodeURIComponent(duration.value)}`, {
        headers: { Accept: 'application/json' }, signal: modifierController.signal
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || 'Catalog request failed.');
      currentPackage = payload;
      duration.dataset.price = payload.basePrice;
      duration.closest('.choice-card').querySelector('small').textContent = money.format(payload.basePrice);
      renderModifierGroups(payload);
      updateSummary();
    } catch (error) {
      if (error.name === 'AbortError') return;
      backendReady = false;
      modifierGroups.replaceChildren();
      modifierStatus.textContent = copy.modifiersUnavailable;
      if (dateInput.value) fallbackTimeOptions();
      submitButton.textContent = copy.fallbackSubmit;
      handoffNote.textContent = copy.fallbackHandoff;
      updateSummary();
    }
  }

  function setTimeOptions(options, placeholder) {
    const first = document.createElement('option');
    first.value = '';
    first.textContent = placeholder;
    timeInput.replaceChildren(first, ...options);
    timeInput.disabled = options.length === 0;
  }

  function fallbackTimeOptions() {
    if (!dateInput.value) return setTimeOptions([], copy.chooseDateFirst);
    const options = [];
    const earliest = Date.now() + 18 * 60 * 60 * 1000;
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
    setTimeOptions(options, copy.chooseTime);
    availabilityStatus.textContent = copy.fallback;
    availabilityStatus.dataset.state = 'fallback';
    submitButton.textContent = copy.fallbackSubmit;
    handoffNote.textContent = copy.fallbackHandoff;
  }

  async function loadAvailability() {
    timeInput.setCustomValidity('');
    if (!dateInput.value) {
      setTimeOptions([], copy.chooseDateFirst);
      return;
    }
    if (!backendReady) return fallbackTimeOptions();

    availabilityController?.abort();
    availabilityController = new AbortController();
    setTimeOptions([], copy.loading);
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
      setTimeOptions(options, options.length ? copy.chooseTime : copy.noSlots);
      availabilityStatus.textContent = options.length ? copy.liveReady : copy.noSlots;
      availabilityStatus.dataset.state = options.length ? 'ready' : 'empty';
      submitButton.textContent = copy.apiSubmit;
      handoffNote.textContent = copy.apiHandoff;
    } catch (error) {
      if (error.name === 'AbortError') return;
      fallbackTimeOptions();
    }
  }

  function updateSummary() {
    const duration = selectedDuration();
    const hours = Number(duration.value);
    const basePrice = Number(duration.dataset.price);
    const modifiers = selectedModifiers();
    const total = modifiers.reduce((sum, modifier) => sum + modifier.price * modifier.quantity, basePrice);

    packageOutput.textContent = `${hours} ${hours === 1 ? copy.hour : copy.hours}`;
    totalOutput.textContent = money.format(total);
    quoteNote.hidden = true;
    const lines = [{ label: copy.base, price: basePrice }, ...modifiers.map(modifier => ({
      label: `${modifier.name}${modifier.quantity > 1 ? ` × ${modifier.quantity}` : ''}`,
      price: modifier.price * modifier.quantity
    }))];
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
  }

  function validateNotice() {
    timeInput.setCustomValidity('');
    if (!dateInput.value || !timeInput.value || selectedStartAt()) return;
    const eventDate = new Date(`${dateInput.value}T${timeInput.value}`);
    if (eventDate < new Date(Date.now() + 18 * 60 * 60 * 1000)) timeInput.setCustomValidity(copy.notice);
  }

  function buildDraft() {
    const duration = selectedDuration();
    return {
      locale: apiLocale,
      eventDate: dateInput.value,
      eventTime: timeInput.value,
      startAt: selectedStartAt(),
      durationHours: Number(duration.value),
      basePrice: Number(duration.dataset.price),
      modifiers: selectedModifiers(),
      address: form.elements.address.value.trim(),
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

  function buildSquareNote(draft) {
    const date = draft.startAt ? new Date(draft.startAt) : new Date(`${draft.eventDate}T${draft.eventTime}`);
    const formattedDate = new Intl.DateTimeFormat(locale, {
      timeZone: draft.startAt ? 'America/New_York' : undefined,
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
    }).format(date);
    const addonTotal = draft.modifiers.reduce((sum, modifier) => sum + modifier.price * modifier.quantity, 0);
    const addonLines = draft.modifiers.length
      ? draft.modifiers.map(modifier => `- ${modifier.name}${modifier.quantity > 1 ? ` × ${modifier.quantity}` : ''}: +${money.format(modifier.price * modifier.quantity)}`).join('\n')
      : `- ${copy.none}`;
    return [copy.noteTitle, `${copy.date}: ${formattedDate}`, `${copy.duration}: ${draft.durationHours} ${draft.durationHours === 1 ? copy.hour : copy.hours} (${money.format(draft.basePrice)})`, `${copy.includedLabel}: ${copy.includedItems}`, copy.staffScope, `${copy.addons}:`, addonLines, `${copy.estimatedTotal}: ${money.format(draft.basePrice + addonTotal)}`, `${copy.address}: ${draft.address}`, `${copy.eventType}: ${draft.eventType}`, `${copy.setting}: ${draft.setting}`, `${copy.attendance}: ${draft.attendance}`, `${copy.requests}: ${draft.requests || copy.none}`].join('\n');
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
    try {
      const response = await fetch(`${apiBase}/config`, { headers: { Accept: 'application/json' } });
      const config = await response.json();
      backendReady = response.ok && config.ready === true;
    } catch (_) { backendReady = false; }
    loadModifiers();
    if (dateInput.value) loadAvailability();
    else {
      availabilityStatus.textContent = backendReady ? copy.chooseDate : copy.fallback;
      submitButton.textContent = backendReady ? copy.apiSubmit : copy.fallbackSubmit;
      handoffNote.textContent = backendReady ? copy.apiHandoff : copy.fallbackHandoff;
    }
  }

  form.addEventListener('input', event => {
    if (event.target.name === 'modifiers' || event.target.dataset.modifierQuantity) modifierStatus.dataset.state = '';
    validateNotice();
    updateSummary();
    if (event.target === dateInput) loadAvailability();
  });
  form.addEventListener('change', event => {
    validateNotice();
    updateSummary();
    if (event.target === dateInput || event.target.name === 'duration') loadAvailability();
    if (event.target.name === 'duration') loadModifiers();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    validateNotice();
    if (backendReady && !currentPackage) {
      modifierStatus.textContent = copy.modifiersLoading;
      return;
    }
    if (!validateModifierRules()) return;
    if (!form.reportValidity()) return;
    const draft = buildDraft();
    const squareNote = buildSquareNote(draft);
    try { sessionStorage.setItem('boomboxcarBookingDraft', JSON.stringify({ ...draft, squareNote })); } catch (_) {}

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
        body: JSON.stringify({
          locale: draft.locale,
          eventDate: draft.eventDate,
          startAt: draft.startAt,
          durationHours: draft.durationHours,
          modifiers: draft.modifiers.map(modifier => ({ id: modifier.id, quantity: modifier.quantity })),
          address: draft.address,
          eventType: draft.eventType,
          setting: draft.setting,
          attendance: draft.attendance,
          requests: draft.requests,
          customer: draft.customer
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || copy.error);
      bookingResult.textContent = `${copy.successTitle}. ${copy.successBody} ${result.reservationId}.${result.orderWarning ? ` ${copy.orderWarning}` : ''}`;
      bookingResult.dataset.state = 'success';
      bookingResult.hidden = false;
      handoffNote.hidden = true;
      form.querySelectorAll('fieldset').forEach(fieldset => { fieldset.disabled = true; });
      if (typeof fireGA === 'function') fireGA('booking_created', { reservation_id: result.reservationId, duration_hours: draft.durationHours, addon_count: draft.modifiers.length, order_id: result.orderId || '', lang: document.documentElement.lang || 'en' });
    } catch (error) {
      bookingResult.textContent = error.message || copy.error;
      bookingResult.dataset.state = 'error';
      bookingResult.hidden = false;
      submitButton.disabled = false;
      submitButton.textContent = copy.apiSubmit;
      loadAvailability();
    }
  });

  updateSummary();
  initializeBackend();
})();
