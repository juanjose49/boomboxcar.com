import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCoupon, buildCustomerNote, calculatePricing, createConfirmationToken, findAvailableSlot, validateReservation } from '../server/reservations.js';

const validInput = {
  locale: 'en', eventDate: '2099-08-20', startAt: '2099-08-20T19:00:00.000Z', durationHours: 1,
  modifiers: [{ id: 'BUBBLE', quantity: 1 }, { id: 'LASER', quantity: 1 }],
  address: {
    addressLine1: '123 Test Street', addressLine2: '', locality: 'Silver Spring',
    administrativeDistrictLevel1: 'MD', postalCode: '20910'
  },
  eventType: 'Birthday', setting: 'Outdoor',
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
  assert.deepEqual(reservation.details.address, validInput.address);
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

test('rejects addresses outside the DMV service area', () => {
  assert.throws(() => validateReservation({
    ...validInput,
    address: { ...validInput.address, administrativeDistrictLevel1: 'PA' }
  }), /Online booking is available in DC, Maryland, and Virginia/i);
});

test('rejects an invalid ZIP code before contacting Square', () => {
  assert.throws(() => validateReservation({
    ...validInput,
    address: { ...validInput.address, postalCode: '2091' }
  }), /valid US ZIP/i);
});

test('rejects address characters Square does not support', () => {
  assert.throws(() => validateReservation({
    ...validInput,
    address: { ...validInput.address, addressLine1: '123 Test Street $' }
  }), /unsupported characters/i);
});

test('accepts the legacy cached address format during rollout', () => {
  const reservation = validateReservation({
    ...validInput,
    address: '123 Test Street, Silver Spring, MD 20910'
  });
  assert.deepEqual(reservation.details.address, validInput.address);
});

test('matches equivalent Square timestamps with and without milliseconds', () => {
  const slots = [{ startAt: '2099-08-20T19:00:00Z', label: '3:00 PM' }];
  assert.equal(findAvailableSlot(slots, '2099-08-20T19:00:00.000Z'), slots[0]);
});

test('creates opaque URL-safe confirmation tokens', () => {
  const first = createConfirmationToken();
  const second = createConfirmationToken();
  assert.match(first, /^[A-Za-z0-9_-]{32}$/);
  assert.notEqual(first, second);
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
  assert.match(note, /Event address: 123 Test Street, Silver Spring, MD 20910/);
  assert.match(note, /Professional-grade audio equipment, the inflatable BoomBox, two wireless microphones/);
  assert.match(note, /MC support and announcements/);
  assert.match(note, /Dedicated DJ service is not included/);
  assert.match(note, /Event contact: Test Customer/);
  assert.match(note, /Contact phone: \+1 301 555 0100/);
});

test('automatically includes locked zero-cost equipment in every purchase', () => {
  const details = {
    durationHours: 1, basePrice: 249, currency: 'USD',
    modifierGroups: [{
      id: 'SITE-INCLUDED-EQUIPMENT', name: 'Included with every booking', minSelections: 2, maxSelections: 2,
      allowQuantities: false,
      modifiers: [
        { id: 'SITE-INCLUDED-RGB-PANELS', name: 'RGB Panels', price: 0, included: true },
        { id: 'BUBBLE', catalogObjectId: 'BUBBLE', name: 'Bubble Machine', price: 0, included: true }
      ]
    }]
  };
  const pricing = calculatePricing(details, []);
  assert.equal(pricing.total, 249);
  assert.deepEqual(pricing.modifiers.map(modifier => [modifier.name, modifier.price, modifier.included]), [
    ['RGB Panels', 0, true], ['Bubble Machine', 0, true]
  ]);
});

test('applies coupons in cents and rejects discounts that cover the entire payment', () => {
  const pricing = calculatePricing(packageDetails, [{ id: 'BUBBLE', quantity: 1 }]);
  const percentage = applyCoupon(pricing, { code: 'SAVE10', type: 'PERCENT', value: 10 });
  assert.equal(percentage.subtotal, 274);
  assert.equal(percentage.discount.amount, 27.4);
  assert.equal(percentage.total, 246.6);

  const fixed = applyCoupon(pricing, { code: 'SAVE50', type: 'FIXED', value: 50 });
  assert.equal(fixed.discount.amount, 50);
  assert.equal(fixed.total, 224);
  assert.throws(
    () => applyCoupon(pricing, { code: 'BIGSAVE', type: 'FIXED', value: 500 }),
    /leave at least \$0\.01/i
  );
  const testPrice = applyCoupon(pricing, { code: 'TEST_SALE', type: 'PERCENT', value: 100 });
  assert.equal(testPrice.discount.amount, 273.99);
  assert.equal(testPrice.total, 0.01);
});

test('normalizes coupon codes and rejects unsupported characters', () => {
  const reservation = validateReservation({ ...validInput, couponCode: ' save-10 ' });
  assert.equal(reservation.couponCode, 'SAVE-10');
  assert.throws(() => validateReservation({ ...validInput, couponCode: 'save 10' }), /valid coupon code/i);
});
