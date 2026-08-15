import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCustomerNote, calculatePricing, findAvailableSlot, validateReservation } from '../server/reservations.js';

const validInput = {
  locale: 'en', eventDate: '2099-08-20', startAt: '2099-08-20T19:00:00.000Z', durationHours: 1,
  modifiers: [{ id: 'BUBBLE', quantity: 1 }, { id: 'LASER', quantity: 1 }],
  address: '123 Test Street, Silver Spring, MD 20910', eventType: 'Birthday', setting: 'Outdoor',
  attendance: 75, requests: 'Main entrance',
  customer: { givenName: 'Test', familyName: 'Customer', email: 'test@example.com', phone: '+1 301 555 0100' }
};

const packageDetails = {
  durationHours: 1, basePrice: 249, currency: 'USD',
  modifierGroups: [{
    id: 'MODIFIER-LIST-1H', name: 'BoomBoxCar 1 Hour Add-Ons', minSelections: 0, maxSelections: 0,
    allowQuantities: false,
    modifiers: [
      { id: 'BUBBLE', name: 'Bubble Machine', price: 25 },
      { id: 'LASER', name: 'Laser & Haze Effects', price: 50 }
    ]
  }]
};

test('validates and normalizes Square modifier selections', () => {
  const reservation = validateReservation(validInput);
  assert.equal(reservation.durationHours, 1);
  assert.deepEqual(reservation.modifiers, [{ id: 'BUBBLE', quantity: 1 }, { id: 'LASER', quantity: 1 }]);
  assert.equal(reservation.customer.email, 'test@example.com');
});

test('splits a customer name at the first space and preserves the remaining last name', () => {
  const reservation = validateReservation({
    ...validInput,
    customer: { ...validInput.customer, givenName: 'Juan San', familyName: 'Emeterio' }
  });
  assert.equal(reservation.customer.givenName, 'Juan');
  assert.equal(reservation.customer.familyName, 'San Emeterio');
});

test('rejects duplicate or malformed modifier selections', () => {
  assert.throws(() => validateReservation({
    ...validInput,
    modifiers: [{ id: 'BUBBLE', quantity: 1 }, { id: 'BUBBLE', quantity: 2 }]
  }), /invalid/i);
});

test('matches equivalent Square timestamps with and without milliseconds', () => {
  const slots = [{ startAt: '2099-08-20T19:00:00Z', label: '3:00 PM' }];
  assert.equal(findAvailableSlot(slots, '2099-08-20T19:00:00.000Z'), slots[0]);
});

test('rejects modifiers that are not attached to the selected Square package', () => {
  assert.throws(() => calculatePricing(packageDetails, [{ id: 'INVENTED', quantity: 1 }]), /not available/i);
});

test('calculates catalog pricing and writes modifiers into the Square booking note', () => {
  const reservation = validateReservation(validInput);
  const pricing = calculatePricing(packageDetails, reservation.modifiers);
  assert.equal(pricing.total, 324);
  const note = buildCustomerNote({ reservationId: 'BBC-2026-ABC123', reservation, pricing });
  assert.match(note, /Bubble Machine: \+\$25/);
  assert.match(note, /Laser & Haze Effects: \+\$50/);
  assert.match(note, /Estimated total: \$324/);
  assert.match(note, /Two powerful speakers, the inflatable BoomBox, two wireless microphones/);
  assert.match(note, /DJ and MC services are not included/);
  assert.match(note, /Event contact: Test Customer/);
  assert.match(note, /Contact phone: \+1 301 555 0100/);
});
