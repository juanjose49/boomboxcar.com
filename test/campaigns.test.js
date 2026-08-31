import test from 'node:test';
import assert from 'node:assert/strict';
import {
  localCustomerHasCompletedBooking, newCustomerOfferStatus, normalizeOfferContact, offerContactKey
} from '../server/campaigns.js';

test('new customer offer normalizes email and phone into a stable private key', () => {
  const first = normalizeOfferContact({ email: ' New@Example.org ', phone: '(301) 555-1212' });
  const second = normalizeOfferContact({ email: 'new@example.org', phone: '+1 301 555 1212' });
  assert.equal(first.email, 'new@example.org');
  assert.equal(first.phoneDigits, '13015551212');
  assert.equal(offerContactKey(first), offerContactKey(second));
  assert.throws(() => normalizeOfferContact({ email: 'bad', phone: '301' }), /valid email/i);
});

test('new customer offer recognizes completed local bookings and active claims', () => {
  const contact = normalizeOfferContact({ email: 'new@example.org', phone: '301-555-1212' });
  const records = [
    { reservationId: 'BBC-2026-ABC123', reservation: { customer: { email: contact.email, phone: contact.phone } } },
    { recordType: 'PAYMENT_EVENT', reservationId: 'BBC-2026-ABC123', paymentStatus: 'COMPLETED' }
  ];
  assert.equal(localCustomerHasCompletedBooking(records, contact), true);
  const key = offerContactKey(contact);
  assert.equal(newCustomerOfferStatus([{ recordType: 'NEW_CUSTOMER_OFFER_CLAIM', contactKey: key, claimId: 'one', expiresAt: '2099-01-01T00:00:00Z' }], key, new Date('2026-01-01')), 'claimed');
  assert.equal(newCustomerOfferStatus([{ recordType: 'NEW_CUSTOMER_OFFER_COMPLETED', contactKey: key }], key), 'redeemed');
});
