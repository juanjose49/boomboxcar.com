import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('partner pricing does not reopen card checkout over an available digital wallet', async () => {
  const booking = await readFile(new URL('../booking.js', import.meta.url), 'utf8');
  const start = booking.indexOf('function updatePartnerPaymentUi');
  const end = booking.indexOf('function partnerDiscountAmount', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const partnerPaymentUi = booking.slice(start, end);
  assert.doesNotMatch(partnerPaymentUi, /cardCheckout\.hidden\s*=\s*false/);
  assert.match(partnerPaymentUi, /cardCheckout\.hidden\s*=\s*true/);
});

test('Partner Pass venue controls are disabled and visibly identified as locked', async () => {
  const booking = await readFile(new URL('../booking.js', import.meta.url), 'utf8');
  assert.match(booking, /control\.disabled = true/);
  assert.match(booking, /control\.dataset\.partnerLocked = 'true'/);
  assert.match(booking, /cannot be edited/);
});
