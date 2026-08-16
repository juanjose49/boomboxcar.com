import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
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
  BOOMBOXCAR_COUPONS: 'PRIVATE50:FIXED:50',
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
  const configuredEnv = {
    ...placeholderEnv,
    SQUARE_ACCESS_TOKEN: 'sandbox-token',
    SQUARE_APPLICATION_ID: 'sandbox-sq0idb-app',
    SQUARE_LOCATION_ID: 'LOCATION-1',
    SQUARE_TEAM_MEMBER_IDS: 'TEAM-1',
    SQUARE_SERVICE_VARIATION_1H: 'SERVICE-1H',
    SQUARE_SERVICE_VARIATION_2H: 'SERVICE-2H',
    SQUARE_SERVICE_VARIATION_3H: 'SERVICE-3H',
    SQUARE_SERVICE_VARIATION_4H: 'SERVICE-4H',
    SQUARE_SERVICE_VARIATION_8H: 'SERVICE-8H',
    BOOMBOXCAR_COUPONS: 'SAVE10:PERCENT:10'
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
});

test('returns a paid confirmation only with its private token', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'boomboxcar-confirmation-'));
  const token = 'abcdefghijklmnopqrstuvwxyzABCDEF';
  const reservationId = 'BBC-2099-ABC123';
  try {
    await persistReservation(dataDir, {
      reservationId, confirmationToken: token, createdAt: '2099-08-20T18:00:00Z',
      squareBookingId: 'BOOKING-1', squareOrderId: 'ORDER-1', bookingStatus: 'ACCEPTED', paymentStatus: 'PENDING',
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
