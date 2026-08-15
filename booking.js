(() => {
  const form = document.getElementById('bookingBuilder');
  if (!form) return;

  const squareBookingUrl = 'https://app.squareup.com/appointments/book/pz9p8fdxiu4g9w/LX5ZE0BPJR0HS/start';
  const isSpanish = (form.dataset.locale || document.documentElement.lang).toLowerCase().startsWith('es');
  const locale = isSpanish ? 'es-US' : 'en-US';
  const copy = isSpanish ? {
    chooseDate: 'Elige una fecha y hora de llegada',
    hour: 'hora',
    hours: 'horas',
    base: 'Servicio base',
    notice: 'La fecha y hora deben tener al menos 18 horas de antelación.',
    noteTitle: 'DETALLES DE BOOMBOXCAR',
    date: 'Fecha y hora',
    duration: 'Duración',
    addons: 'Extras',
    none: 'Ninguno',
    address: 'Dirección',
    eventType: 'Tipo de evento',
    setting: 'Entorno',
    attendance: 'Asistencia esperada',
    requests: 'Solicitudes especiales',
    estimatedTotal: 'Total estimado',
    customQuote: 'cotización personalizada'
  } : {
    chooseDate: 'Choose a date and arrival time',
    hour: 'hour',
    hours: 'hours',
    base: 'Base service',
    notice: 'Date and time must be at least 18 hours from now.',
    noteTitle: 'BOOMBOXCAR EVENT DETAILS',
    date: 'Date and time',
    duration: 'Duration',
    addons: 'Add-ons',
    none: 'None',
    address: 'Address',
    eventType: 'Event type',
    setting: 'Setting',
    attendance: 'Expected attendance',
    requests: 'Special requests',
    estimatedTotal: 'Estimated total',
    customQuote: 'custom quote'
  };

  const dateInput = form.elements.eventDate;
  const timeInput = form.elements.eventTime;
  const packageOutput = document.getElementById('summaryPackage');
  const dateOutput = document.getElementById('summaryDate');
  const linesOutput = document.getElementById('summaryLines');
  const totalOutput = document.getElementById('summaryTotal');
  const quoteNote = document.getElementById('quoteNote');
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

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

  function updateSummary() {
    const duration = selectedDuration();
    const hours = Number(duration.value);
    const basePrice = Number(duration.dataset.price);
    const selectedAddons = [...form.querySelectorAll('input[name="addons"]:checked')];
    const pricedAddons = selectedAddons.filter(addon => addon.dataset.price);
    const hasQuoteItems = selectedAddons.some(addon => addon.dataset.quote === 'true');
    const total = pricedAddons.reduce((sum, addon) => sum + Number(addon.dataset.price), basePrice);

    packageOutput.textContent = `${hours} ${hours === 1 ? copy.hour : copy.hours}`;
    totalOutput.textContent = money.format(total);
    quoteNote.hidden = !hasQuoteItems;

    const lines = [{ label: copy.base, price: basePrice }, ...pricedAddons.map(addon => ({ label: addon.value, price: Number(addon.dataset.price) }))];
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
      const date = new Date(`${dateInput.value}T${timeInput.value}`);
      dateOutput.textContent = new Intl.DateTimeFormat(locale, {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit'
      }).format(date);
    } else {
      dateOutput.textContent = copy.chooseDate;
    }
  }

  function validateNotice() {
    dateInput.setCustomValidity('');
    timeInput.setCustomValidity('');
    if (!dateInput.value || !timeInput.value) return;
    const eventDate = new Date(`${dateInput.value}T${timeInput.value}`);
    const earliest = new Date(Date.now() + 18 * 60 * 60 * 1000);
    if (eventDate < earliest) timeInput.setCustomValidity(copy.notice);
  }

  function buildSquareNote(draft) {
    const date = new Date(`${draft.eventDate}T${draft.eventTime}`);
    const formattedDate = new Intl.DateTimeFormat(locale, {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    }).format(date);
    const addonTotal = draft.addons.reduce((sum, addon) => sum + (addon.price || 0), 0);
    const addonLines = draft.addons.length
      ? draft.addons.map(addon => `- ${addon.name}: ${addon.price === null ? copy.customQuote : `+${money.format(addon.price)}`}`).join('\n')
      : `- ${copy.none}`;

    return [
      copy.noteTitle,
      `${copy.date}: ${formattedDate}`,
      `${copy.duration}: ${draft.durationHours} ${draft.durationHours === 1 ? copy.hour : copy.hours} (${money.format(draft.basePrice)})`,
      `${copy.addons}:`,
      addonLines,
      `${copy.estimatedTotal}: ${money.format(draft.basePrice + addonTotal)}`,
      `${copy.address}: ${draft.address}`,
      `${copy.eventType}: ${draft.eventType}`,
      `${copy.setting}: ${draft.setting}`,
      `${copy.attendance}: ${draft.attendance}`,
      `${copy.requests}: ${draft.requests || copy.none}`
    ].join('\n');
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
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

  form.addEventListener('input', () => {
    validateNotice();
    updateSummary();
  });

  form.addEventListener('change', () => {
    validateNotice();
    updateSummary();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    validateNotice();
    if (!form.reportValidity()) return;

    const duration = selectedDuration();
    const draft = {
      eventDate: dateInput.value,
      eventTime: timeInput.value,
      durationHours: Number(duration.value),
      basePrice: Number(duration.dataset.price),
      addons: [...form.querySelectorAll('input[name="addons"]:checked')].map(addon => ({
        name: addon.value,
        price: addon.dataset.price ? Number(addon.dataset.price) : null
      })),
      address: form.elements.address.value.trim(),
      eventType: form.elements.eventType.value,
      setting: form.elements.setting.value,
      attendance: Number(form.elements.attendance.value),
      requests: form.elements.requests.value.trim()
    };

    const squareNote = buildSquareNote(draft);
    let detailsCopied = false;
    try { sessionStorage.setItem('boomboxcarBookingDraft', JSON.stringify({ ...draft, squareNote })); } catch (_) {}
    detailsCopied = await copyText(squareNote);
    if (typeof fireGA === 'function') {
      fireGA('square_availability_handoff', {
        duration_hours: draft.durationHours,
        addon_count: draft.addons.length,
        event_type: draft.eventType,
        details_copied: detailsCopied,
        lang: document.documentElement.lang || 'en'
      });
    }
    window.location.href = squareBookingUrl;
  });

  updateSummary();
})();
