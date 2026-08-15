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
  APP_BASE_URL: 'http://localhost', ALLOWED_ORIGIN: 'http://localhost'
};

test('health and public config never expose the access token', async () => {
  await withServer(placeholderEnv, async baseUrl => {
    const health = await fetch(`${baseUrl}/api/health`).then(response => response.json());
    assert.equal(health.ok, true);
    assert.equal(health.squareConfigured, false);
    const config = await fetch(`${baseUrl}/api/config`).then(response => response.json());
    assert.equal(config.ready, false);
    assert.equal(config.paymentTtlMinutes, 30);
    assert.equal(JSON.stringify(config).includes('ACCESS_TOKEN'), false);
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
      squareOrderId: 'ORDER-1', paymentStatus: 'COMPLETED', receiptUrl: 'https://squareup.com/receipt/preview/TEST'
    });
    await withServer({ ...placeholderEnv, DATA_DIR: dataDir }, async baseUrl => {
      const response = await fetch(`${baseUrl}/api/confirmations/${reservationId}?token=${token}`);
      assert.equal(response.status, 200);
      const confirmation = await response.json();
      assert.equal(confirmation.paymentStatus, 'COMPLETED');
      assert.equal(confirmation.reservation.customer.familyName, 'Customer');
      assert.equal(confirmation.pricing.total, 249);
      assert.equal(JSON.stringify(confirmation).includes(token), false);

      const privateResponse = await fetch(`${baseUrl}/api/confirmations/${reservationId}?token=ABCDEFGHIJKLMNOPQRSTUVWXYZ123456`);
      assert.equal(privateResponse.status, 404);
    });
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
