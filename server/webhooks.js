import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifySquareWebhook({ body, notificationUrl, signature, signatureKey }) {
  if (!body || !notificationUrl || !signature || !signatureKey) return false;
  const expected = createHmac('sha256', signatureKey)
    .update(`${notificationUrl}${body}`, 'utf8')
    .digest('base64');
  const receivedBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export function paymentEventRecord(event) {
  if (!['payment.created', 'payment.updated'].includes(event?.type)) return null;
  const payment = event.data?.object?.payment;
  if (!event.event_id || !payment?.id || !payment?.order_id || !payment?.status) return null;
  const reservationId = String(payment.note || '').match(/\bBBC-\d{4}-[A-F0-9]{6}\b/)?.[0] || null;
  return {
    recordType: 'PAYMENT_EVENT',
    eventId: event.event_id,
    eventType: event.type,
    eventCreatedAt: event.created_at || null,
    receivedAt: new Date().toISOString(),
    reservationId,
    squarePaymentId: payment.id,
    squareOrderId: payment.order_id,
    paymentStatus: payment.status,
    amountMoney: payment.amount_money || null,
    receiptUrl: payment.receipt_url || null
  };
}
