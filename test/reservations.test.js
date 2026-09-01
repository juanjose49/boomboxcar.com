import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCoupon, buildCustomerNote, calculatePricing, createConfirmationToken, findAvailableSlot, validatePartnerActivationReservation, validateReservation } from '../server/reservations.js';
import { applyPartnerPass, applyPartnerRate, campaignBookingUrl, normalizePartnerPermissions, parsePartners, partnerAlreadyRedeemed, partnerRedemptionStatus, publicPartner, resolveCampaign, resolvePartner, validatePartnerVenue } from '../server/partners.js';

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

test('partner configuration stays private and limits eligible durations', () => {
  const token = 'abcdefghijklmnopqrstuv';
  const partners = parsePartners(JSON.stringify([{
    token, code: 'DTSS26', name: 'Downtown Silver Spring', maxHours: 4,
    venueAddress: validInput.address, futureDiscountPercent: 15,
    expiresOn: '2099-12-31', sourceReferralId: 'DTSS26', qrCampaignId: 'DTSS26-A1',
    newCustomerDiscountPercent: 10, newCustomerOfferEndsOn: '2099-11-30'
  }]));
  const partner = resolvePartner(partners, token, new Date('2099-01-01T00:00:00Z'));
  assert.deepEqual(publicPartner(partner).eligibleDurations, [2, 3, 4]);
  assert.deepEqual(publicPartner(partner).venueAddress, validInput.address);
  assert.equal(publicPartner(partner).formattedVenueAddress, '123 Test Street, Silver Spring, MD 20910');
  assert.deepEqual(publicPartner(partner).eventOffer, { campaignId: 'DTSS26-A1', discountPercent: 10, endsOn: '2099-11-30' });
  assert.equal(JSON.stringify(publicPartner(partner)).includes(token), false);
  const campaign = resolveCampaign(partners, 'DTSS26-A1', new Date('2099-01-01T00:00:00Z'));
  assert.equal(campaignBookingUrl('https://boomboxcar.com', campaign), 'https://boomboxcar.com/?ref=DTSS26&qr=DTSS26-A1&utm_source=event_qr&utm_medium=offline&utm_campaign=DTSS26-A1');
});

test('partner configuration honors its minimum and maximum activation duration', () => {
  const partner = [...parsePartners(JSON.stringify([{
    token: 'abcdefghijklmnopqrstuv', code: 'THREE26', name: 'Three Hour Venue',
    minHours: 3, maxHours: 4, valueCap: 599, venueAddress: validInput.address,
    expiresOn: '2099-12-31'
  }])).values()][0];
  assert.deepEqual(publicPartner(partner).eligibleDurations, [3, 4]);
  assert.throws(() => applyPartnerPass({ total: 399 }, partner, 2), /covers 3 to 4 hours/i);
});

test('partner configuration supports a one-hour minimum activation', () => {
  const partner = [...parsePartners(JSON.stringify([{
    token: 'abcdefghijklmnopqrstuv', code: 'ONEHOUR26', name: 'One Hour Venue',
    minHours: 1, maxHours: 3, valueCap: 599, venueAddress: validInput.address,
    expiresOn: '2099-12-31'
  }])).values()][0];
  assert.deepEqual(publicPartner(partner).eligibleDurations, [1, 2, 3]);
  const pricing = applyPartnerPass({ total: 249 }, partner, 1);
  assert.equal(pricing.partnerDiscount.packageRetailValue, 249);
  assert.equal(pricing.total, 0);
});

test('partner activation checkout derives venue details and requires scheduling plus organizer contact', () => {
  const partner = {
    code: 'VENUE26', name: 'Test Venue', sourceReferralId: 'VENUE26',
    venueAddress: validInput.address
  };
  const reservation = validatePartnerActivationReservation({
    durationHours: 3, eventDate: '2099-08-20', startAt: '2099-08-20T19:00:00.000Z',
    givenName: 'Alex', familyName: 'Coordinator', email: 'events@example.org', phone: '301-555-0123'
  }, partner);
  assert.equal(reservation.durationHours, 3);
  assert.equal(reservation.customer.givenName, 'Alex');
  assert.equal(reservation.customer.familyName, 'Coordinator');
  assert.equal(reservation.customer.email, 'events@example.org');
  assert.equal(reservation.customer.phone, '301-555-0123');
  assert.deepEqual(reservation.modifiers, []);
  assert.deepEqual(reservation.details.address, validInput.address);
  assert.equal(reservation.details.eventType, 'Partner activation');
  assert.throws(() => validatePartnerActivationReservation({
    durationHours: 3, eventDate: '2099-08-20', startAt: '2099-08-20T19:00:00.000Z',
    givenName: 'Alex', familyName: '', email: 'events@example.org', phone: '301-555-0123'
  }, partner), /first and last name/i);
});

test('redeemed partners receive the ongoing rate for the configured venue regardless of customer email', () => {
  const pricing = { basePrice: 399, modifiers: [{ name: 'Add-on', price: 100 }], total: 499, currency: 'USD' };
  const partner = { code: 'TEST26', futureDiscountPercent: 15, venueAddress: validInput.address };
  const discounted = applyPartnerRate(pricing, partner);
  assert.equal(discounted.partnerDiscount.amount, 74.85);
  assert.equal(discounted.total, 424.15);
  assert.deepEqual(validatePartnerVenue(partner, { ...validInput.address, addressLine1: '123 TEST STREET' }), validInput.address);
  assert.throws(() => validatePartnerVenue(partner, { ...validInput.address, addressLine1: '125 Test Street' }), /partner venue address/i);
  assert.equal(partnerRedemptionStatus([{ recordType: 'PARTNER_REDEMPTION_COMPLETED', partnerCode: 'TEST26' }], 'TEST26'), 'redeemed');
});

test('Partner Pass applies up to $599 across duration and add-ons, then leaves only the excess due', () => {
  const pricing = calculatePricing(packageDetails, [{ id: 'LASER', quantity: 1 }]);
  const partnerPricing = applyPartnerPass(pricing, { code: 'TEST26', maxHours: 2, valueCap: 599 }, 2);
  assert.equal(partnerPricing.partnerDiscount.amount, 299);
  assert.equal(partnerPricing.partnerDiscount.retailValue, 299);
  assert.equal(partnerPricing.total, 0);

  const excessPricing = applyPartnerPass({ ...pricing, basePrice: 399, total: 674 }, { code: 'TEST26', maxHours: 2, valueCap: 599 }, 2);
  assert.equal(excessPricing.partnerDiscount.amount, 599);
  assert.equal(excessPricing.total, 75);
  assert.throws(() => applyPartnerPass(pricing, { code: 'TEST26', maxHours: 2 }, 3), /covers up to 2 hours/i);
});

test('Partner Pass requires every onsite permission and enforces one active redemption', () => {
  assert.throws(() => normalizePartnerPermissions({ signageAndQr: true }), /Accept all Partner Pass/i);
  assert.deepEqual(normalizePartnerPermissions({ signageAndQr: true, photoVideo: true, publicIdentification: true, safetyAndVenue: true }), {
    signageAndQr: true, photoVideo: true, publicIdentification: true, safetyAndVenue: true
  });
  assert.equal(partnerAlreadyRedeemed([{ recordType: 'PARTNER_REDEMPTION_COMPLETED', partnerCode: 'TEST26' }], 'TEST26'), true);
  assert.equal(partnerAlreadyRedeemed([{ recordType: 'PARTNER_REDEMPTION_CLAIM', partnerCode: 'TEST26', claimId: 'claim', expiresAt: '2000-01-01T00:00:00Z' }], 'TEST26'), false);
});
