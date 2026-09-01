import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { persistReservation } from '../server/reservations.js';

async function withServer(env, callback, fetchImpl = globalThis.fetch) {
  const server = createServer(createApp({ env, fetchImpl }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  try { await callback(`http://127.0.0.1:${address.port}`); }
  finally { server.close(); await once(server, 'close'); }
}

const placeholderEnv = {
  NODE_ENV: 'production', SQUARE_ENVIRONMENT: 'sandbox',
  SQUARE_ACCESS_TOKEN: 'REPLACE_WITH_SQUARE_SANDBOX_ACCESS_TOKEN',
  SQUARE_LOCATION_ID: 'REPLACE_WITH_SQUARE_LOCATION_ID',
  SQUARE_TEAM_MEMBER_IDS: 'REPLACE_WITH_COMMA_SEPARATED_TEAM_MEMBER_IDS',
  SQUARE_SERVICE_VARIATION_1H: 'REPLACE_WITH_1H_VARIATION_ID',
  SQUARE_SERVICE_VARIATION_2H: 'REPLACE_WITH_2H_VARIATION_ID',
  SQUARE_SERVICE_VARIATION_3H: 'REPLACE_WITH_3H_VARIATION_ID',
  SQUARE_SERVICE_VARIATION_4H: 'REPLACE_WITH_4H_VARIATION_ID',
  SQUARE_SERVICE_VARIATION_8H: 'REPLACE_WITH_8H_VARIATION_ID',
  APP_BASE_URL: 'http://localhost', ALLOWED_ORIGIN: 'http://localhost'
};

test('health and public config never expose the access token', async () => {
  await withServer(placeholderEnv, async baseUrl => {
    const health = await fetch(`${baseUrl}/api/health`).then(response => response.json());
    assert.equal(health.ok, true);
    assert.equal(health.squareConfigured, false);
    const config = await fetch(`${baseUrl}/api/config`).then(response => response.json());
    assert.equal(config.ready, false);
    assert.equal(config.webPaymentsReady, false);
    assert.equal(config.applePayReady, false);
    assert.equal(config.googlePayReady, false);
    assert.equal(config.webPaymentsSdkUrl, 'https://sandbox.web.squarecdn.com/v1/square.js');
    assert.equal(config.paymentTtlMinutes, 30);
    assert.equal(JSON.stringify(config).includes('ACCESS_TOKEN'), false);
    assert.equal(JSON.stringify(config).includes('PRIVATE50'), false);
  });
});

test('availability reports an unconfigured Sandbox without contacting Square', async () => {
  await withServer(placeholderEnv, async baseUrl => {
    const response = await fetch(`${baseUrl}/api/availability`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2026-08-20', durationHours: 3 })
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, 'SQUARE_NOT_CONFIGURED');
  });
});

test('private Partner Pass lookup returns safe invitation details and rejects invalid tokens', async () => {
  const token = 'abcdefghijklmnopqrstuv';
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'boomboxcar-partner-'));
  try {
    await writeFile(path.join(dataDir, 'partners.json'), `${JSON.stringify([{
      token, code: 'DTSS26', name: 'Downtown Silver Spring', venueAddress: {
        addressLine1: '123 Test Street', addressLine2: '', locality: 'Silver Spring',
        administrativeDistrictLevel1: 'MD', postalCode: '20910'
      },
      maxHours: 4, expiresOn: '2099-12-31', newCustomerOfferEndsOn: '2099-11-30', qrCampaignId: 'DTSS26-EVENT'
    }])}\n`);
    await withServer({ ...placeholderEnv, DATA_DIR: dataDir }, async baseUrl => {
      const response = await fetch(`${baseUrl}/api/partners/${token}`);
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.partner.name, 'Downtown Silver Spring');
      assert.deepEqual(payload.partner.eligibleDurations, [2, 3, 4]);
      assert.equal(payload.partner.futureDiscountPercent, 15);
      assert.deepEqual(payload.partner.eventOffer, { campaignId: 'DTSS26-EVENT', discountPercent: 10, endsOn: '2099-11-30' });
      assert.equal(payload.partner.formattedVenueAddress, '123 Test Street, Silver Spring, MD 20910');
      assert.equal(JSON.stringify(payload).includes(token), false);
      await persistReservation(dataDir, { recordType: 'PARTNER_REDEMPTION_COMPLETED', partnerCode: 'DTSS26' });
      const redeemedPayload = await fetch(`${baseUrl}/api/partners/${token}`).then(result => result.json());
      assert.equal(redeemedPayload.partner.activationAvailable, false);
      assert.equal(redeemedPayload.partner.ongoingRateAvailable, true);
      assert.equal(redeemedPayload.partner.futureDiscountPercent, 15);
      const campaignPayload = await fetch(`${baseUrl}/api/campaigns/DTSS26-EVENT`).then(result => result.json());
      assert.deepEqual(campaignPayload.campaign, { id: 'DTSS26-EVENT', discountPercent: 10, endsOn: '2099-11-30' });
      const qrResponse = await fetch(`${baseUrl}/api/partners/${token}/qr.svg`);
      assert.equal(qrResponse.status, 404);
      const invalid = await fetch(`${baseUrl}/api/partners/invalid-invalid-invalid-x`);
      assert.equal(invalid.status, 404);
    });
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('business admin requires Basic Authentication and persists partners and coupons', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'boomboxcar-admin-'));
  const adminEnv = {
    ...placeholderEnv, DATA_DIR: dataDir,
    BOOMBOXCAR_ADMIN_USERNAME: 'partner-admin', BOOMBOXCAR_ADMIN_PASSWORD: 'test-password-123'
  };
  const authorization = `Basic ${Buffer.from('partner-admin:test-password-123').toString('base64')}`;
  const partnerInput = {
    code: 'VENUE26', name: 'Test Venue', venueAddress: {
      addressLine1: '123 Test Street', addressLine2: '', locality: 'Silver Spring',
      administrativeDistrictLevel1: 'MD', postalCode: '20910'
    },
    minHours: 1, maxHours: 2, futureDiscountPercent: 15,
    newCustomerDiscountPercent: 10, newCustomerOfferEndsOn: '2099-11-30', expiresOn: '2099-12-31',
    sourceReferralId: 'VENUE26', qrCampaignId: 'VENUE26-EVENT', active: true
  };
  try {
    let createdToken = '';
    await withServer(adminEnv, async baseUrl => {
      const unauthorized = await fetch(`${baseUrl}/api/admin/partners`);
      assert.equal(unauthorized.status, 401);
      assert.match(unauthorized.headers.get('www-authenticate'), /Basic realm=/);
      const rejected = await fetch(`${baseUrl}/api/admin/partners`, {
        headers: { Authorization: `Basic ${Buffer.from('partner-admin:wrong-password').toString('base64')}` }
      });
      assert.equal(rejected.status, 401);
      assert.equal(rejected.headers.get('www-authenticate'), null);

      const created = await fetch(`${baseUrl}/api/admin/partners`, {
        method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify(partnerInput)
      });
      assert.equal(created.status, 201);
      const payload = await created.json();
      createdToken = payload.partner.token;
      assert.match(createdToken, /^[A-Za-z0-9_-]{22,128}$/);
      assert.equal(payload.partner.minHours, 1);
      assert.equal(payload.partner.maxHours, 2);
      assert.equal(Object.hasOwn(payload.partner, 'valueCap'), false);
      assert.match(payload.partner.privateUrl, /\/partner\/\?pass=/);
      assert.match(payload.partner.qrImageUrl, /\/api\/admin\/partners\/VENUE26\/qr\.svg$/);
      assert.match(payload.partner.qrDestinationUrl, /\?ref=VENUE26&qr=VENUE26-EVENT/);
      assert.equal(payload.partner.qrDestinationUrl.includes('#'), false);
      assert.equal(JSON.stringify(payload).includes('test-password-123'), false);

      const adminQrPath = new URL(payload.partner.qrImageUrl).pathname;
      const publicQr = await fetch(`${baseUrl}${adminQrPath}`);
      assert.equal(publicQr.status, 401);
      const adminQr = await fetch(`${baseUrl}${adminQrPath}`, { headers: { Authorization: authorization } });
      assert.equal(adminQr.status, 200);
      assert.match(adminQr.headers.get('content-type'), /image\/svg\+xml/);
      assert.match(await adminQr.text(), /<svg/);

      const publicPartner = await fetch(`${baseUrl}/api/partners/${createdToken}`);
      assert.equal(publicPartner.status, 200);

      const updated = await fetch(`${baseUrl}/api/admin/partners/VENUE26`, {
        method: 'PUT', headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...partnerInput, name: 'Updated Test Venue', active: false })
      });
      assert.equal(updated.status, 200);
      assert.equal((await updated.json()).partner.active, false);
      assert.equal((await fetch(`${baseUrl}/api/partners/${createdToken}`)).status, 404);

      const createdCoupon = await fetch(`${baseUrl}/api/admin/coupons`, {
        method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'SAVE10', type: 'PERCENT', value: 10, active: true })
      });
      assert.equal(createdCoupon.status, 201);
      assert.deepEqual((await createdCoupon.json()).coupon, { code: 'SAVE10', type: 'PERCENT', value: 10, active: true });
      const updatedCoupon = await fetch(`${baseUrl}/api/admin/coupons/SAVE10`, {
        method: 'PUT', headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'FIXED', value: 25, active: false })
      });
      assert.equal(updatedCoupon.status, 200);
      assert.deepEqual((await updatedCoupon.json()).coupon, { code: 'SAVE10', type: 'FIXED', value: 25, active: false });

      const reservationId = 'BBC-2099-ABC123';
      await persistReservation(dataDir, {
        reservationId, confirmationToken: 'abcdefghijklmnopqrstuvwxyzABCDEF', createdAt: '2099-08-20T18:00:00Z',
        squareBookingId: 'BOOKING-1', squareOrderId: 'ORDER-1', bookingStatus: 'ACCEPTED', paymentStatus: 'PROCESSING',
        paymentMethod: 'card',
        reservation: {
          locale: 'en', eventDate: '2099-08-20', startAt: '2099-08-20T19:00:00Z', durationHours: 2,
          customer: { givenName: 'Admin', familyName: 'Customer', email: 'admin@example.com', phone: '240-555-0100' },
          details: { eventType: 'Community event', setting: 'Outdoor', attendance: 80, requests: '', address: {
            addressLine1: '123 Test Street', addressLine2: '', locality: 'Silver Spring', administrativeDistrictLevel1: 'MD', postalCode: '20910'
          } }
        },
        pricing: { basePrice: 399, modifiers: [], total: 399, currency: 'USD' }
      });
      await persistReservation(dataDir, {
        recordType: 'PAYMENT_EVENT', reservationId, eventCreatedAt: '2099-08-20T18:01:00Z',
        paymentStatus: 'COMPLETED', amountMoney: { amount: 34900, currency: 'USD' }, receiptUrl: 'https://squareup.com/receipt/preview/ADMIN'
      });
      const unauthorizedBookings = await fetch(`${baseUrl}/api/admin/bookings`);
      assert.equal(unauthorizedBookings.status, 401);
      const bookingPayload = await fetch(`${baseUrl}/api/admin/bookings`, { headers: { Authorization: authorization } }).then(response => response.json());
      assert.equal(bookingPayload.bookings.length, 1);
      assert.equal(bookingPayload.bookings[0].reservationId, reservationId);
      assert.equal(bookingPayload.bookings[0].paymentStatus, 'COMPLETED');
      assert.equal(bookingPayload.bookings[0].pricing.total, 349);
      assert.match(bookingPayload.bookings[0].confirmationUrl, /\/confirmation\/\?reservation=BBC-2099-ABC123&token=/);
      assert.equal(Object.hasOwn(bookingPayload.bookings[0], 'confirmationToken'), false);
    });

    const stored = JSON.parse(await readFile(path.join(dataDir, 'partners.json'), 'utf8'));
    assert.equal(stored[0].name, 'Updated Test Venue');
    assert.equal(stored[0].active, false);
    const storedCoupons = JSON.parse(await readFile(path.join(dataDir, 'coupons.json'), 'utf8'));
    assert.deepEqual(storedCoupons, [{ code: 'SAVE10', type: 'FIXED', value: 25, active: false }]);

    await withServer(adminEnv, async baseUrl => {
      const payload = await fetch(`${baseUrl}/api/admin/partners`, { headers: { Authorization: authorization } }).then(response => response.json());
      assert.equal(payload.partners.length, 1);
      assert.equal(payload.partners[0].name, 'Updated Test Venue');
      assert.equal(payload.partners[0].token, createdToken);
      const couponPayload = await fetch(`${baseUrl}/api/admin/coupons`, { headers: { Authorization: authorization } }).then(response => response.json());
      assert.deepEqual(couponPayload.coupons, [{ code: 'SAVE10', type: 'FIXED', value: 25, active: false }]);
    });
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('event QR eligibility accepts a new contact and rejects completed local customers', async () => {
  const token = 'abcdefghijklmnopqrstuv';
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'boomboxcar-campaign-'));
  const configuredEnv = {
    ...placeholderEnv, DATA_DIR: dataDir,
    SQUARE_ACCESS_TOKEN: 'sandbox-token', SQUARE_APPLICATION_ID: 'sandbox-app',
    SQUARE_LOCATION_ID: 'LOCATION-1', SQUARE_TEAM_MEMBER_IDS: 'TEAM-1',
    SQUARE_SERVICE_VARIATION_1H: 'SERVICE-1H', SQUARE_SERVICE_VARIATION_2H: 'SERVICE-2H',
    SQUARE_SERVICE_VARIATION_3H: 'SERVICE-3H', SQUARE_SERVICE_VARIATION_4H: 'SERVICE-4H',
    SQUARE_SERVICE_VARIATION_8H: 'SERVICE-8H'
  };
  const fakeFetch = async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    await writeFile(path.join(dataDir, 'partners.json'), `${JSON.stringify([{
      token, code: 'EVENT26', name: 'Event Partner', venueAddress: {
        addressLine1: '123 Test Street', addressLine2: '', locality: 'Silver Spring',
        administrativeDistrictLevel1: 'MD', postalCode: '20910'
      },
      newCustomerOfferEndsOn: '2099-12-31', qrCampaignId: 'EVENT26-QR', expiresOn: '2099-12-31'
    }])}\n`);
    await withServer(configuredEnv, async baseUrl => {
      const contact = { email: 'new@example.org', phone: '301-555-1212' };
      const first = await fetch(`${baseUrl}/api/campaigns/EVENT26-QR/eligibility`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contact)
      }).then(response => response.json());
      assert.equal(first.eligible, true);
      await persistReservation(dataDir, { reservationId: 'BBC-2026-ABC123', reservation: { customer: contact } });
      await persistReservation(dataDir, { recordType: 'PAYMENT_EVENT', reservationId: 'BBC-2026-ABC123', paymentStatus: 'COMPLETED' });
      const second = await fetch(`${baseUrl}/api/campaigns/EVENT26-QR/eligibility`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contact)
      }).then(response => response.json());
      assert.equal(second.eligible, false);
    }, fakeFetch);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('hosted checkout reservation creation is no longer exposed', async () => {
  await withServer(placeholderEnv, async baseUrl => {
    const response = await fetch(`${baseUrl}/api/reservations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    });
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, 'NOT_FOUND');
  });
});

test('embedded Google Pay checkout rejects a stale displayed total before creating a booking or charge', async () => {
  const squareRequests = [];
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'boomboxcar-coupon-payment-'));
  const configuredEnv = {
    ...placeholderEnv,
    DATA_DIR: dataDir,
    SQUARE_ACCESS_TOKEN: 'sandbox-token',
    SQUARE_APPLICATION_ID: 'sandbox-sq0idb-app',
    SQUARE_LOCATION_ID: 'LOCATION-1',
    SQUARE_TEAM_MEMBER_IDS: 'TEAM-1',
    SQUARE_SERVICE_VARIATION_1H: 'SERVICE-1H',
    SQUARE_SERVICE_VARIATION_2H: 'SERVICE-2H',
    SQUARE_SERVICE_VARIATION_3H: 'SERVICE-3H',
    SQUARE_SERVICE_VARIATION_4H: 'SERVICE-4H',
    SQUARE_SERVICE_VARIATION_8H: 'SERVICE-8H'
  };
  const variation = {
    type: 'ITEM_VARIATION', id: 'SERVICE-3H',
    item_variation_data: {
      item_id: 'ITEM-3H', name: '3 hours',
      price_money: { amount: 54900, currency: 'USD' }
    }
  };
  const item = {
    type: 'ITEM', id: 'ITEM-3H',
    item_data: { name: '3 Hour Rental', variations: [variation], modifier_list_info: [] }
  };
  const fakeFetch = async url => {
    squareRequests.push(url);
    const payload = url.includes('SERVICE-3H')
      ? { object: variation, related_objects: [item] }
      : { object: item, related_objects: [] };
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    await writeFile(path.join(dataDir, 'coupons.json'), `${JSON.stringify([{ code: 'SAVE10', type: 'PERCENT', value: 10, active: true }])}\n`);
    await withServer(configuredEnv, async baseUrl => {
      const couponResponse = await fetch(`${baseUrl}/api/coupons/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ couponCode: 'save10', durationHours: 3, modifiers: [] })
      });
      assert.equal(couponResponse.status, 200);
      const couponResult = await couponResponse.json();
      assert.equal(couponResult.coupon.code, 'SAVE10');
      assert.equal(couponResult.coupon.amount, 54.9);
      assert.equal(couponResult.pricing.total, 494.1);

      const response = await fetch(`${baseUrl}/api/reservations/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceToken: 'cnon:google-pay-token', paymentMethod: 'googlePay', expectedTotalCents: 54800,
          locale: 'en', eventDate: '2099-08-20', startAt: '2099-08-20T19:00:00Z', durationHours: 3,
          modifiers: [],
          address: {
            addressLine1: '123 Test Street', addressLine2: '', locality: 'Silver Spring',
            administrativeDistrictLevel1: 'MD', postalCode: '20910'
          },
          eventType: 'Community event', setting: 'Outdoor', attendance: 100, requests: '',
          customer: { givenName: 'Test', familyName: 'Customer', email: 'buyer@example.com', phone: '240-555-0100' }
        })
      });
      assert.equal(response.status, 409);
      assert.equal((await response.json()).error.code, 'PRICE_CHANGED');
    }, fakeFetch);
    assert.equal(squareRequests.length, 2);
    assert.equal(squareRequests.some(url => url.includes('/v2/bookings')), false);
    assert.equal(squareRequests.some(url => url.includes('/v2/payments')), false);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('returns a paid confirmation only with its private token', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'boomboxcar-confirmation-'));
  const token = 'abcdefghijklmnopqrstuvwxyzABCDEF';
  const reservationId = 'BBC-2099-ABC123';
  try {
    await persistReservation(dataDir, {
      reservationId, confirmationToken: token, createdAt: '2099-08-20T18:00:00Z',
      squareBookingId: 'BOOKING-1', squareOrderId: 'ORDER-1', bookingStatus: 'ACCEPTED', paymentStatus: 'PENDING',
      paymentMethod: 'card',
      reservation: {
        locale: 'en', eventDate: '2099-08-20', startAt: '2099-08-20T19:00:00Z', durationHours: 1,
        customer: { givenName: 'Test', familyName: 'Customer', email: 'test@example.com', phone: '240-555-0100' },
        details: {
          address: { addressLine1: '123 Test Street', addressLine2: '', locality: 'Silver Spring', administrativeDistrictLevel1: 'MD', postalCode: '20910' },
          eventType: 'Birthday', setting: 'Outdoor', attendance: 50, requests: 'Main entrance'
        }
      },
      pricing: { basePrice: 249, modifiers: [], total: 249, currency: 'USD' }
    });
    await persistReservation(dataDir, {
      recordType: 'PAYMENT_EVENT', eventCreatedAt: '2099-08-20T18:05:00Z', reservationId,
      squareOrderId: 'ORDER-1', paymentStatus: 'COMPLETED',
      amountMoney: { amount: 19900, currency: 'USD' },
      receiptUrl: 'https://squareup.com/receipt/preview/TEST'
    });
    await withServer({ ...placeholderEnv, DATA_DIR: dataDir }, async baseUrl => {
      const response = await fetch(`${baseUrl}/api/confirmations/${reservationId}?token=${token}`);
      assert.equal(response.status, 200);
      const confirmation = await response.json();
      assert.equal(confirmation.paymentStatus, 'COMPLETED');
      assert.equal(confirmation.paymentMethod, 'card');
      assert.equal(confirmation.reservation.customer.familyName, 'Customer');
      assert.equal(confirmation.pricing.total, 199);
      assert.deepEqual(confirmation.pricing.squareAdjustment, { amount: -50 });
      assert.equal(JSON.stringify(confirmation).includes(token), false);

      const privateResponse = await fetch(`${baseUrl}/api/confirmations/${reservationId}?token=ABCDEFGHIJKLMNOPQRSTUVWXYZ123456`);
      assert.equal(privateResponse.status, 404);
    });
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
