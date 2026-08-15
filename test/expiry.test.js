import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { expirePendingReservations, expiredPendingReservations } from '../server/expiry.js';
import { persistReservation, readReservationRecords } from '../server/reservations.js';

const pending = {
  reservationId: 'BBC-2099-ABC123', createdAt: '2099-08-20T19:00:00Z', expiresAt: '2099-08-20T19:30:00Z',
  squareBookingId: 'BOOKING-1', bookingVersion: 2, squarePaymentLinkId: 'LINK-1', squareOrderId: 'ORDER-1',
  paymentStatus: 'PENDING'
};

test('finds expired pending reservations and excludes completed payments', () => {
  const now = Date.parse('2099-08-20T19:31:00Z');
  assert.deepEqual(expiredPendingReservations([pending], now), [pending]);
  assert.deepEqual(expiredPendingReservations([pending, {
    recordType: 'PAYMENT_EVENT', reservationId: pending.reservationId, paymentStatus: 'COMPLETED'
  }], now), []);
});

test('expires an unpaid Square checkout and cancels its appointment', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'boomboxcar-expiry-'));
  const calls = [];
  const square = {
    async retrieveOrder(id) { calls.push(['retrieveOrder', id]); return { id, state: 'OPEN' }; },
    async deletePaymentLink(id) { calls.push(['deletePaymentLink', id]); return { id, cancelled_order_id: 'ORDER-1' }; },
    async cancelBooking(booking) { calls.push(['cancelBooking', booking]); return { id: booking.id, status: 'CANCELLED_BY_SELLER' }; }
  };
  try {
    await persistReservation(dataDir, pending);
    const results = await expirePendingReservations({
      dataDir, square, now: new Date('2099-08-20T19:31:00Z')
    });
    assert.equal(results[0].paymentStatus, 'EXPIRED');
    assert.deepEqual(calls, [
      ['retrieveOrder', 'ORDER-1'],
      ['deletePaymentLink', 'LINK-1'],
      ['cancelBooking', { id: 'BOOKING-1', version: 2 }]
    ]);
    const records = await readReservationRecords(dataDir);
    assert.equal(records.at(-1).recordType, 'PAYMENT_EXPIRATION');
    assert.equal(expiredPendingReservations(records, Date.parse('2099-08-20T20:00:00Z')).length, 0);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('reconciles a paid order without canceling its appointment', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'boomboxcar-paid-'));
  let destructiveCalls = 0;
  const square = {
    async retrieveOrder() { return { id: 'ORDER-1', state: 'COMPLETED' }; },
    async deletePaymentLink() { destructiveCalls += 1; },
    async cancelBooking() { destructiveCalls += 1; }
  };
  try {
    await persistReservation(dataDir, pending);
    const results = await expirePendingReservations({
      dataDir, square, now: new Date('2099-08-20T19:31:00Z')
    });
    assert.equal(results[0].paymentStatus, 'COMPLETED');
    assert.equal(destructiveCalls, 0);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
