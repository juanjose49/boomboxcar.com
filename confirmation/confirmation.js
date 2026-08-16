(() => {
  const params = new URLSearchParams(window.location.search);
  const reservationId = params.get('reservation') || '';
  const token = params.get('token') || '';
  const loading = document.getElementById('confirmation-loading');
  const loadingCopy = document.getElementById('confirmation-loading-copy');
  const errorPanel = document.getElementById('confirmation-error');
  const errorTitle = document.getElementById('confirmation-error-title');
  const errorCopy = document.getElementById('confirmation-error-copy');
  const documentPanel = document.getElementById('confirmation-document');
  const retryButton = document.getElementById('retry-confirmation');
  let attempts = 0;

  const copy = {
    en: {
      locale: 'en-US', eyebrow: 'BoomBoxCar booking confirmation', title: 'Your event is confirmed.',
      prepared: name => `Prepared for ${name}`, confirmed: date => `Payment confirmed ${date}`,
      total: 'Total paid', paid: 'Paid through Square', download: 'Download confirmation PDF',
      pdfHelp: 'In the print dialog, choose Save as PDF.', receipt: 'View Square receipt', home: 'Return to BoomBoxCar',
      eventEyebrow: 'Event', eventTitle: 'Event details', paymentEyebrow: 'Payment', pricingTitle: 'Pricing breakdown',
      customerEyebrow: 'Customer', contactTitle: 'Contact', includedEyebrow: 'Included', includedTitle: 'Every BoomBoxCar booking includes',
      requestsEyebrow: 'Planning', requestsTitle: 'Event notes', referencesEyebrow: 'Reference', referencesTitle: 'Booking references',
      service: 'Service', quantity: 'Quantity', amount: 'Amount', totalPaid: 'Total paid',
      coupon: code => `Coupon ${code}`,
      squareDiscount: 'Square Checkout discount', squareAdjustment: 'Square Checkout adjustment',
      dateTime: 'Date and arrival', duration: 'Duration', address: 'Event address', eventType: 'Event type', setting: 'Setting',
      attendance: 'Expected attendance', name: 'Name', email: 'Email', phone: 'Phone', reservation: 'Reservation',
      squareBooking: 'Square booking', squareOrder: 'Square order', created: 'Created', hours: value => `${value} hour${value === 1 ? '' : 's'}`,
      baseService: value => `${value}-hour BoomBoxCar booking`, none: 'None provided',
      included: ['Professional-grade audio equipment', 'Inflatable BoomBox', 'Two wireless microphones', 'Licensed music and commercial insurance', 'Daytime bubbles', 'Nighttime RGB light panels', 'MC support and announcements', 'On-board power with no outlets required'],
      scope: 'BoomBoxCar staff set up and operate the system, manage licensed music playback, and provide MC support and announcements. Dedicated DJ service is not included. You provide general musical direction and the event message; staff retain control of playback and programming.',
      footerTitle: 'Thank you for booking BoomBoxCar.',
      footerCopy: 'Keep this confirmation for your records. Questions or updates? Contact booking@boomboxcar.com.',
      processing: 'Square is still confirming your payment. This page will retry automatically.',
      errorTitle: 'We could not load this confirmation.', errorCopy: 'Check the confirmation link or contact booking@boomboxcar.com for help.',
      expiredTitle: 'This reservation is no longer active.', expiredCopy: 'The unpaid reservation expired. Return to BoomBoxCar to choose another time.', retry: 'Try again', contact: 'Contact BoomBoxCar'
    },
    es: {
      locale: 'es-US', eyebrow: 'Confirmación de reserva de BoomBoxCar', title: 'Tu evento está confirmado.',
      prepared: name => `Preparado para ${name}`, confirmed: date => `Pago confirmado ${date}`,
      total: 'Total pagado', paid: 'Pagado mediante Square', download: 'Descargar confirmación en PDF',
      pdfHelp: 'En el cuadro de impresión, elige Guardar como PDF.', receipt: 'Ver recibo de Square', home: 'Volver a BoomBoxCar',
      eventEyebrow: 'Evento', eventTitle: 'Detalles del evento', paymentEyebrow: 'Pago', pricingTitle: 'Desglose de precios',
      customerEyebrow: 'Cliente', contactTitle: 'Contacto', includedEyebrow: 'Incluido', includedTitle: 'Cada reserva de BoomBoxCar incluye',
      requestsEyebrow: 'Planificación', requestsTitle: 'Notas del evento', referencesEyebrow: 'Referencia', referencesTitle: 'Referencias de la reserva',
      service: 'Servicio', quantity: 'Cantidad', amount: 'Importe', totalPaid: 'Total pagado',
      coupon: code => `Cupón ${code}`,
      squareDiscount: 'Descuento de Square Checkout', squareAdjustment: 'Ajuste de Square Checkout',
      dateTime: 'Fecha y llegada', duration: 'Duración', address: 'Dirección del evento', eventType: 'Tipo de evento', setting: 'Entorno',
      attendance: 'Asistencia esperada', name: 'Nombre', email: 'Correo', phone: 'Teléfono', reservation: 'Reserva',
      squareBooking: 'Reserva de Square', squareOrder: 'Pedido de Square', created: 'Creada', hours: value => `${value} hora${value === 1 ? '' : 's'}`,
      baseService: value => `Reserva de BoomBoxCar de ${value} hora${value === 1 ? '' : 's'}`, none: 'No se proporcionaron',
      included: ['Equipo de audio profesional', 'BoomBox inflable', 'Dos micrófonos inalámbricos', 'Música con licencia y seguro comercial', 'Burbujas de día', 'Paneles de luz RGB de noche', 'Apoyo de maestro de ceremonias y anuncios', 'Energía a bordo sin necesidad de tomacorrientes'],
      scope: 'El personal de BoomBoxCar instala y opera el sistema, gestiona la reproducción de música con licencia y brinda apoyo de maestro de ceremonias y anuncios. El servicio dedicado de DJ no está incluido. Tú proporcionas la dirección musical general y el mensaje del evento; el personal conserva el control de la reproducción y la programación.',
      footerTitle: 'Gracias por reservar BoomBoxCar.',
      footerCopy: 'Guarda esta confirmación. Para preguntas o cambios, escribe a booking@boomboxcar.com.',
      processing: 'Square todavía está confirmando tu pago. Esta página volverá a intentarlo automáticamente.',
      errorTitle: 'No pudimos cargar esta confirmación.', errorCopy: 'Revisa el enlace de confirmación o escribe a booking@boomboxcar.com para obtener ayuda.',
      expiredTitle: 'Esta reserva ya no está activa.', expiredCopy: 'La reserva sin pagar venció. Vuelve a BoomBoxCar para elegir otra hora.', retry: 'Intentar de nuevo', contact: 'Contactar a BoomBoxCar'
    }
  };

  function money(value, currency, locale) {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 2 }).format(value);
  }

  function formatAddress(address) {
    return [address.addressLine1, address.addressLine2, address.locality,
      `${address.administrativeDistrictLevel1} ${address.postalCode}`].filter(Boolean).join(', ');
  }

  function addDetails(target, rows) {
    target.replaceChildren();
    rows.forEach(([label, value]) => {
      const term = document.createElement('dt');
      const detail = document.createElement('dd');
      term.textContent = label;
      detail.textContent = value;
      target.append(term, detail);
    });
  }

  function setText(id, value) {
    document.getElementById(id).textContent = value;
  }

  function applyCopy(c) {
    setText('confirmation-eyebrow', c.eyebrow); setText('confirmation-title', c.title);
    setText('total-label', c.total); setText('confirmation-status', c.paid); setText('download-confirmation', c.download);
    setText('pdf-help', c.pdfHelp); setText('square-receipt', c.receipt);
    document.querySelector('.document-actions .text-link').textContent = c.home;
    setText('event-eyebrow', c.eventEyebrow); setText('event-title', c.eventTitle);
    setText('pricing-eyebrow', c.paymentEyebrow); setText('pricing-title', c.pricingTitle);
    setText('contact-eyebrow', c.customerEyebrow); setText('contact-title', c.contactTitle);
    setText('included-eyebrow', c.includedEyebrow); setText('included-title', c.includedTitle);
    setText('requests-eyebrow', c.requestsEyebrow); setText('requests-title', c.requestsTitle);
    setText('references-eyebrow', c.referencesEyebrow); setText('references-title', c.referencesTitle);
    setText('service-label', c.service); setText('quantity-label', c.quantity); setText('amount-label', c.amount); setText('paid-label', c.totalPaid);
    setText('footer-title', c.footerTitle); setText('footer-copy', c.footerCopy);
    retryButton.textContent = c.retry;
    errorPanel.querySelector('a').textContent = c.contact;
  }

  function render(data) {
    const reservation = data.reservation;
    const pricing = data.pricing;
    const c = copy[reservation.locale] || copy.en;
    const locale = c.locale;
    const name = `${reservation.customer.givenName} ${reservation.customer.familyName}`.trim();
    const eventDate = new Intl.DateTimeFormat(locale, {
      timeZone: 'America/New_York', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit'
    }).format(new Date(reservation.startAt));
    const confirmedDate = new Intl.DateTimeFormat(locale, {
      timeZone: 'America/New_York', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit'
    }).format(new Date(data.confirmedAt));
    const createdDate = new Intl.DateTimeFormat(locale, {
      timeZone: 'America/New_York', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    }).format(new Date(data.createdAt));

    document.documentElement.lang = reservation.locale === 'es' ? 'es' : 'en';
    document.title = `BoomBoxCar Confirmation ${data.reservationId}`;
    applyCopy(c);
    setText('confirmation-lead', c.prepared(name));
    setText('confirmation-issued', c.confirmed(confirmedDate));
    setText('confirmation-total', money(pricing.total, pricing.currency, locale));
    setText('pricing-total', money(pricing.total, pricing.currency, locale));
    addDetails(document.getElementById('event-details'), [
      [c.dateTime, eventDate], [c.duration, c.hours(reservation.durationHours)],
      [c.address, formatAddress(reservation.details.address)], [c.eventType, reservation.details.eventType],
      [c.setting, reservation.details.setting], [c.attendance, String(reservation.details.attendance)]
    ]);
    addDetails(document.getElementById('contact-details'), [
      [c.name, name], [c.email, reservation.customer.email], [c.phone, reservation.customer.phone]
    ]);
    addDetails(document.getElementById('reference-details'), [
      [c.reservation, data.reservationId], [c.squareBooking, data.squareBookingId],
      [c.squareOrder, data.squareOrderId], [c.created, createdDate]
    ]);

    const pricingBody = document.getElementById('pricing-lines');
    pricingBody.replaceChildren();
    const lines = [
      { name: c.baseService(reservation.durationHours), quantity: 1, price: pricing.basePrice },
      ...pricing.modifiers,
      ...(pricing.discount ? [{ name: c.coupon(pricing.discount.code), quantity: 1, price: -pricing.discount.amount }] : []),
      ...(pricing.squareAdjustment ? [{
        name: pricing.squareAdjustment.amount < 0 ? c.squareDiscount : c.squareAdjustment,
        quantity: 1,
        price: pricing.squareAdjustment.amount
      }] : [])
    ];
    lines.forEach(line => {
      const row = document.createElement('tr');
      const service = document.createElement('th');
      const quantity = document.createElement('td');
      const amount = document.createElement('td');
      service.scope = 'row'; service.textContent = line.name;
      quantity.textContent = String(line.quantity || 1);
      amount.textContent = money(line.price, pricing.currency, locale);
      row.append(service, quantity, amount); pricingBody.append(row);
    });

    const included = document.getElementById('included-list');
    included.replaceChildren(...c.included.map(item => {
      const entry = document.createElement('li'); entry.textContent = item; return entry;
    }));
    setText('scope-note', c.scope);
    setText('special-requests', reservation.details.requests || c.none);

    const receipt = document.getElementById('square-receipt');
    try {
      const receiptUrl = new URL(data.receiptUrl);
      if (receiptUrl.protocol === 'https:') { receipt.href = receiptUrl.href; receipt.hidden = false; }
    } catch (_) {}

    loading.hidden = true;
    errorPanel.hidden = true;
    documentPanel.hidden = false;
  }

  function showError(error, status) {
    const isSpanish = document.documentElement.lang === 'es';
    const c = copy[isSpanish ? 'es' : 'en'];
    errorTitle.textContent = status === 410 ? c.expiredTitle : c.errorTitle;
    errorCopy.textContent = status === 410 ? c.expiredCopy : (error?.message || c.errorCopy);
    loading.hidden = true;
    documentPanel.hidden = true;
    errorPanel.hidden = false;
  }

  async function loadConfirmation() {
    if (!/^BBC-\d{4}-[A-F0-9]{6}$/.test(reservationId) || !/^[A-Za-z0-9_-]{32}$/.test(token)) {
      showError(null, 404); return;
    }
    loading.hidden = false;
    errorPanel.hidden = true;
    try {
      const response = await fetch(`/api/confirmations/${encodeURIComponent(reservationId)}?token=${encodeURIComponent(token)}`, {
        headers: { Accept: 'application/json' }
      });
      const payload = await response.json();
      if (response.status === 409 && attempts < 5) {
        attempts += 1;
        loadingCopy.textContent = copy.en.processing;
        setTimeout(loadConfirmation, 2000);
        return;
      }
      if (!response.ok) { showError(payload.error, response.status); return; }
      render(payload);
    } catch (_) { showError(null, 0); }
  }

  retryButton.addEventListener('click', () => { attempts = 0; loadConfirmation(); });
  document.getElementById('download-confirmation').addEventListener('click', () => window.print());
  loadConfirmation();
})();
