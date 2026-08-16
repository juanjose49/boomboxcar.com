import { PAYMENT_TTL_MINUTES, loadConfig } from './config.js';
import { persistReservation, readReservationRecords } from './reservations.js';
import { createSquareService } from './square.js';

export function expiredPendingReservations(records, now = Date.now()) {
  const pending = new Map();
  for (const record of records) {
    if (record?.reservationId && record.paymentStatus === 'PENDING'
      && record.squareBookingId && record.squarePaymentLinkId && record.squareOrderId && record.expiresAt) {
      pending.set(record.reservationId, record);
      continue;
    }
    if (!record?.reservationId) continue;
    if ((record.recordType === 'PAYMENT_EVENT' && record.paymentStatus === 'COMPLETED')
      || (record.recordType === 'PAYMENT_RECONCILIATION' && record.paymentStatus === 'COMPLETED')
      || (record.recordType === 'PAYMENT_EXPIRATION' && record.paymentStatus === 'EXPIRED')) {
      pending.delete(record.reservationId);
    }
  }
  return [...pending.values()].filter(record => Date.parse(record.expiresAt) <= now);
}

export async function expirePendingReservations({ dataDir, square, now = new Date() }) {
  const records = await readReservationRecords(dataDir);
  const expired = expiredPendingReservations(records, now.getTime());
  const results = [];
  for (const reservation of expired) {
    try {
      const order = await square.retrieveOrder(reservation.squareOrderId);
      if (order?.state === 'COMPLETED') {
        const record = {
          recordType: 'PAYMENT_RECONCILIATION',
          reservationId: reservation.reservationId,
          recordedAt: now.toISOString(),
          squareOrderId: reservation.squareOrderId,
          paymentStatus: 'COMPLETED',
          amountMoney: order.total_money || null
        };
        await persistReservation(dataDir, record);
        results.push(record);
        continue;
      }
      if (order?.state !== 'CANCELED') {
        await square.deletePaymentLink(reservation.squarePaymentLinkId);
      }
      const booking = await square.cancelBooking({
        id: reservation.squareBookingId,
        version: reservation.bookingVersion
      });
      const record = {
        recordType: 'PAYMENT_EXPIRATION',
        reservationId: reservation.reservationId,
        expiredAt: now.toISOString(),
        ttlMinutes: PAYMENT_TTL_MINUTES,
        squareBookingId: reservation.squareBookingId,
        squarePaymentLinkId: reservation.squarePaymentLinkId,
        squareOrderId: reservation.squareOrderId,
        bookingStatus: booking?.status || 'CANCELED',
        paymentStatus: 'EXPIRED'
      };
      await persistReservation(dataDir, record);
      results.push(record);
    } catch (error) {
      const record = {
        recordType: 'PAYMENT_EXPIRATION_ERROR',
        reservationId: reservation.reservationId,
        attemptedAt: now.toISOString(),
        squareBookingId: reservation.squareBookingId,
        squarePaymentLinkId: reservation.squarePaymentLinkId,
        squareOrderId: reservation.squareOrderId,
        error: { code: error.code || 'EXPIRATION_FAILED', message: error.message }
      };
      await persistReservation(dataDir, record);
      results.push(record);
    }
  }
  return results;
}

export function startReservationExpiry({ env = process.env, fetchImpl = globalThis.fetch, intervalMs = 60_000 } = {}) {
  const config = loadConfig(env);
  if (!config.squareConfigured) return { run: async () => [], stop() {} };
  const square = createSquareService(config, fetchImpl);
  let running = false;
  const run = async () => {
    if (running) return [];
    running = true;
    try {
      return await expirePendingReservations({ dataDir: config.dataDir, square });
    } catch (error) {
      console.error('[boomboxcar-api] reservation expiry', error.code || error.name, error.message);
      return [];
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return { run, stop() { clearInterval(timer); } };
}
