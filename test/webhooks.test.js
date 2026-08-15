import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { paymentEventRecord, verifySquareWebhook } from '../server/webhooks.js';

test('validates Square webhook signatures against the exact URL and raw body', () => {
  const notificationUrl = 'https://boomboxcar.com/api/webhooks/square';
  const signatureKey = 'signature-key';
  const body = '{"type":"payment.updated"}';
  const signature = createHmac('sha256', signatureKey).update(`${notificationUrl}${body}`).digest('base64');

  assert.equal(verifySquareWebhook({ body, notificationUrl, signature, signatureKey }), true);
  assert.equal(verifySquareWebhook({ body: `${body} `, notificationUrl, signature, signatureKey }), false);
});

test('normalizes Square payment events for the private reservation log', () => {
  const record = paymentEventRecord({
    event_id: 'EVENT-1', type: 'payment.updated', created_at: '2099-08-20T20:00:00Z',
    data: { object: { payment: {
      id: 'PAYMENT-1', order_id: 'ORDER-1', status: 'COMPLETED',
      note: 'BoomBoxCar BBC-2099-ABC123; Square booking BOOKING-1',
      amount_money: { amount: 32400, currency: 'USD' },
      receipt_url: 'https://squareup.com/receipt/preview/TEST'
    } } }
  });

  assert.equal(record.reservationId, 'BBC-2099-ABC123');
  assert.equal(record.paymentStatus, 'COMPLETED');
  assert.equal(record.squareOrderId, 'ORDER-1');
  assert.equal(record.amountMoney.amount, 32400);
});

test('ignores unrelated webhook event types', () => {
  assert.equal(paymentEventRecord({ event_id: 'EVENT-2', type: 'customer.created' }), null);
});
