(() => {
  const params = new URLSearchParams(location.search);
  const token = params.get('pass') || '';
  const status = document.getElementById('status');
  const content = document.getElementById('partnerContent');
  const benefit = document.getElementById('partnerBenefit');
  const venue = document.getElementById('partnerVenue');
  const bookButton = document.getElementById('bookPartner');
  const linkInput = document.getElementById('partnerLink');
  const copyButton = document.getElementById('copyPartnerLink');
  const qrImage = document.getElementById('partnerQr');
  const qrDownload = document.getElementById('downloadPartnerQr');
  const qrSection = document.getElementById('eventQrSection');
  const qrOffer = document.getElementById('eventQrOffer');

  if (!/^[A-Za-z0-9_-]{22,128}$/.test(token)) {
    status.textContent = 'This partner link is not valid. Contact booking@boomboxcar.com for help.';
    return;
  }

  const partnerUrl = new URL('/partner/', location.origin);
  partnerUrl.searchParams.set('pass', token);
  const qrUrl = `/api/partners/${encodeURIComponent(token)}/qr.svg`;

  fetch(`/api/partners/${encodeURIComponent(token)}`, { headers: { Accept: 'application/json' } })
    .then(async response => ({ response, payload: await response.json() }))
    .then(({ response, payload }) => {
      if (!response.ok) throw new Error(payload.error?.message || 'This partner page is not available.');
      const partner = payload.partner;
      document.title = `${partner.name} | BoomBoxCar Partner`;
      document.getElementById('partnerTitle').textContent = partner.name;
      status.textContent = 'BoomBoxCar Partner';
      if (partner.activationAvailable) {
        benefit.textContent = `Your first activation includes up to $${partner.valueCap} toward an eligible 2- to ${partner.maxHours}-hour booking and add-ons. Afterward, receive ${partner.futureDiscountPercent}% off future eligible bookings and add-ons.`;
      } else if (partner.ongoingRateAvailable) {
        benefit.textContent = `Your complimentary activation has been redeemed. You now receive ${partner.futureDiscountPercent}% off future eligible bookings and add-ons.`;
      } else {
        benefit.textContent = 'Your complimentary activation is currently being processed. This page will become available for future Partner Rate bookings after it is confirmed.';
        bookButton.disabled = true;
      }
      venue.textContent = `Partner venue: ${partner.formattedVenueAddress}`;
      linkInput.value = partnerUrl.toString();
      if (partner.eventOffer) {
        qrOffer.textContent = `Place this QR code on BoomBoxCar at the event. It opens the booking page, tracks this campaign, and offers new customers ${partner.eventOffer.discountPercent}% off when they book by ${partner.eventOffer.endsOn}.`;
        qrImage.src = qrUrl;
        qrDownload.href = qrUrl;
      } else qrSection.hidden = true;
      content.hidden = false;
    })
    .catch(error => { status.textContent = error.message; });

  bookButton.addEventListener('click', () => {
    const destination = new URL('/', location.origin);
    destination.hash = `partner_pass=${encodeURIComponent(token)}`;
    location.assign(destination.href);
  });

  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(linkInput.value);
      copyButton.textContent = 'Copied';
    } catch (_) {
      linkInput.select();
      copyButton.textContent = 'Select and copy';
    }
  });
})();
