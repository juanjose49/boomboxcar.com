import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCustomerNote, calculatePricing, validateReservation } from '../server/reservations.js';

const validInput = {
  locale: 'en', eventDate: '2026-08-20', startAt: '2026-08-20T19:00:00.000Z', durationHours: 4,
  addons: ['night', 'microphone'], address: '123 Test Street, Silver Spring, MD 20910',
  eventType: 'Birthday', setting: 'Outdoor', attendance: 75, requests: 'Main entrance',
  customer: { givenName: 'Test', familyName: 'Customer', email: 'test@example.com', phone: '+1 301 555 0100' }
};

test('validates and normalizes a reservation', () => {
  const reservation = validateReservation(validInput);
  assert.equal(reservation.durationHours, 4);
  assert.deepEqual(reservation.addonKeys, ['night', 'microphone']);
  assert.equal(reservation.customer.email, 'test@example.com');
});

test('rejects unknown add-ons', () => {
  assert.throws(() => validateReservation({ ...validInput, addons: ['invented'] }), /invalid/i);
});

test('calculates authoritative pricing and writes modifiers into the Square note', () => {
  const reservation = validateReservation(validInput);
  const pricing = calculatePricing(4, reservation.addonKeys);
  assert.equal(pricing.total, 824);
  assert.equal(pricing.hasCustomQuote, true);
  const note = buildCustomerNote({ reservationId: 'BBC-2026-ABC123', reservation, pricing });
  assert.match(note, /Night package: \+\$125/);
  assert.match(note, /Additional microphone: custom quote/);
  assert.match(note, /Estimated total: \$824 plus custom-quote items/);
});
