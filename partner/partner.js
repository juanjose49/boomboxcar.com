(() => {
  const params = new URLSearchParams(location.search);
  const token = params.get('pass') || '';
  const form = document.getElementById('activationForm');
  const status = document.getElementById('status');
  const content = document.getElementById('partnerContent');
  const benefit = document.getElementById('partnerBenefit');
  const venue = document.getElementById('partnerVenue');
  const durations = document.getElementById('partnerDurations');
  const durationHelp = document.getElementById('durationHelp');
  const dateInput = document.getElementById('partnerDate');
  const timeInput = document.getElementById('partnerTime');
  const availabilityStatus = document.getElementById('availabilityStatus');
  const summaryDuration = document.getElementById('partnerSummaryDuration');
  const summaryDiscount = document.getElementById('partnerSummaryDiscount');
  const submitButton = document.getElementById('confirmActivation');
  const bookingResult = document.getElementById('bookingResult');
  const ratePanel = document.getElementById('partnerRatePanel');
  const rateCopy = document.getElementById('partnerRateCopy');
  const rateButton = document.getElementById('bookPartnerRate');
  let partner = null;
  let minimumNoticeHours = 18;
  let availabilityController = null;

  if (!/^[A-Za-z0-9_-]{22,128}$/.test(token)) {
    status.textContent = 'This partner link is not valid. Contact booking@boomboxcar.com for help.';
    return;
  }

  function selectedDuration() {
    return form.querySelector('input[name="duration"]:checked');
  }

  function localDateValue(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function nextEligibleSaturday() {
    const date = new Date(Date.now() + minimumNoticeHours * 60 * 60 * 1000);
    date.setHours(12, 0, 0, 0);
    const days = (6 - date.getDay() + 7) % 7;
    date.setDate(date.getDate() + days);
    return localDateValue(date);
  }

  function updateSummary() {
    const input = selectedDuration();
    if (!input) return;
    const hours = Number(input.value);
    const retailValue = Number(partner.retailValues[hours] || 0);
    summaryDuration.textContent = `${hours} ${hours === 1 ? 'hour' : 'hours'} · $${retailValue} retail value`;
    summaryDiscount.textContent = `-$${retailValue}`;
  }

  function setTimeOptions(options, placeholder) {
    const first = document.createElement('option');
    first.value = '';
    first.textContent = placeholder;
    timeInput.replaceChildren(first, ...options);
    timeInput.disabled = options.length === 0;
  }

  async function loadAvailability() {
    const duration = selectedDuration();
    if (!duration || !dateInput.value) {
      setTimeOptions([], 'Choose a date');
      availabilityStatus.textContent = '';
      return;
    }
    availabilityController?.abort();
    availabilityController = new AbortController();
    setTimeOptions([], 'Checking live availability…');
    availabilityStatus.textContent = 'Checking live Square availability…';
    try {
      const response = await fetch('/api/availability', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateInput.value, durationHours: Number(duration.value), locale: 'en' }),
        signal: availabilityController.signal
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || 'Availability could not be loaded.');
      const options = payload.slots.map(slot => {
        const option = document.createElement('option');
        option.value = slot.startAt;
        option.textContent = slot.label;
        return option;
      });
      setTimeOptions(options, options.length ? 'Choose a start time' : 'No times available');
      availabilityStatus.textContent = options.length ? 'Availability is confirmed directly with Square.' : 'No start times are available for this date and duration.';
    } catch (error) {
      if (error.name === 'AbortError') return;
      setTimeOptions([], 'Availability unavailable');
      availabilityStatus.textContent = error.message;
    }
  }

  function renderDurations() {
    durations.replaceChildren(...partner.eligibleDurations.map((hours, index) => {
      const label = document.createElement('label');
      label.className = 'partner-duration-card';
      const input = document.createElement('input');
      input.type = 'radio'; input.name = 'duration'; input.value = String(hours); input.required = true; input.checked = index === 0;
      const text = document.createElement('span');
      const title = document.createElement('strong');
      const price = document.createElement('small');
      title.textContent = `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
      price.textContent = `$${partner.retailValues[hours]} value · $0`;
      text.append(title, price); label.append(input, text);
      return label;
    }));
    durationHelp.textContent = partner.minHours === partner.maxHours
      ? `This invitation is configured for a ${partner.minHours}-hour activation.`
      : `Choose from ${partner.minHours} to ${partner.maxHours} hours.`;
    updateSummary();
  }

  async function initialize() {
    try {
      const [partnerResponse, configResponse] = await Promise.all([
        fetch(`/api/partners/${encodeURIComponent(token)}`, { headers: { Accept: 'application/json' } }),
        fetch('/api/config', { headers: { Accept: 'application/json' } })
      ]);
      const partnerPayload = await partnerResponse.json();
      const configPayload = await configResponse.json().catch(() => ({}));
      if (!partnerResponse.ok) throw new Error(partnerPayload.error?.message || 'This partner page is not available.');
      partner = partnerPayload.partner;
      if (Number.isFinite(Number(configPayload.minimumNoticeHours))) minimumNoticeHours = Number(configPayload.minimumNoticeHours);
      document.title = `${partner.name} | BoomBoxCar Partner Pass`;
      document.getElementById('partnerTitle').textContent = partner.name;
      status.textContent = partner.activationAvailable ? 'Your complimentary BoomBoxCar activation' : 'BoomBoxCar Partner';
      venue.textContent = `Activation venue: ${partner.formattedVenueAddress}`;
      benefit.textContent = `Select an eligible duration with up to $${partner.valueCap} in retail value. The complete standard service shown here is included at no charge.`;

      if (partner.activationAvailable) {
        renderDurations();
        const earliest = new Date(Date.now() + minimumNoticeHours * 60 * 60 * 1000);
        dateInput.min = localDateValue(earliest);
        dateInput.value = nextEligibleSaturday();
        await loadAvailability();
      } else {
        form.hidden = true;
        if (partner.ongoingRateAvailable) {
          rateCopy.textContent = `Use this private page to receive ${partner.futureDiscountPercent}% off eligible future bookings and add-ons at ${partner.formattedVenueAddress}.`;
          ratePanel.hidden = false;
        } else {
          rateCopy.textContent = 'Your activation is currently being processed. Return to this page shortly.';
          ratePanel.hidden = false;
          rateButton.hidden = true;
        }
      }
      content.hidden = false;
    } catch (error) {
      status.textContent = error.message;
    }
  }

  form.addEventListener('change', event => {
    if (event.target.name === 'duration') {
      updateSummary();
      void loadAvailability();
    }
    if (event.target === dateInput) void loadAvailability();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity() || !timeInput.value || !partner) return;
    submitButton.disabled = true;
    bookingResult.hidden = false;
    bookingResult.dataset.state = '';
    bookingResult.textContent = 'Confirming your complimentary activation…';
    try {
      const response = await fetch(`/api/partners/${encodeURIComponent(token)}/reservations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          durationHours: Number(selectedDuration().value),
          eventDate: dateInput.value,
          startAt: timeInput.value,
          email: form.elements.email.value.trim(),
          partnerPermissions: { signageAndQr: true, photoVideo: true, publicIdentification: true, safetyAndVenue: true }
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || 'The activation could not be confirmed.');
      const confirmationUrl = new URL(payload.confirmationUrl);
      if (confirmationUrl.origin !== location.origin || confirmationUrl.pathname !== '/confirmation/') throw new Error('The confirmation link was invalid.');
      location.assign(confirmationUrl.href);
    } catch (error) {
      bookingResult.textContent = error.message;
      bookingResult.dataset.state = 'error';
      submitButton.disabled = false;
      void loadAvailability();
    }
  });

  rateButton.addEventListener('click', () => {
    const destination = new URL('/', location.origin);
    destination.hash = `partner_pass=${encodeURIComponent(token)}`;
    location.assign(destination.href);
  });

  void initialize();
})();
