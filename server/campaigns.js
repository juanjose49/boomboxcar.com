import { createHash, randomBytes } from 'node:crypto';
import { AppError } from './errors.js';

function clean(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function normalizeOfferContact(input) {
  const email = clean(input?.email, 254).toLowerCase();
  const phone = clean(input?.phone, 24);
  const phoneDigits = phone.replace(/\D/g, '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError(400, 'INVALID_EMAIL', 'Enter a valid email address.');
  if (![10, 11].includes(phoneDigits.length) || (phoneDigits.length === 11 && !phoneDigits.startsWith('1'))) {
    throw new AppError(400, 'INVALID_PHONE', 'Enter a valid US mobile phone number.');
  }
  return { email, phone, phoneDigits: phoneDigits.length === 10 ? `1${phoneDigits}` : phoneDigits };
}

export function offerContactKey(contact) {
  return createHash('sha256').update(`${contact.email}\n${contact.phoneDigits}`).digest('base64url');
}

export function localCustomerHasCompletedBooking(records, contact) {
  const reservationIds = new Set(records.filter(record => {
    const customer = record.reservation?.customer;
    if (!customer) return false;
    const digits = String(customer.phone || '').replace(/\D/g, '');
    const normalizedDigits = digits.length === 10 ? `1${digits}` : digits;
    return String(customer.email || '').toLowerCase() === contact.email || normalizedDigits === contact.phoneDigits;
  }).map(record => record.reservationId));
  return records.some(record => reservationIds.has(record.reservationId)
    && record.paymentStatus === 'COMPLETED'
    && ['PAYMENT_EVENT', 'PAYMENT_RECONCILIATION', 'PARTNER_REDEMPTION_COMPLETED'].includes(record.recordType));
}

export function newCustomerOfferStatus(records, contactKey, now = new Date()) {
  if (records.some(record => record.recordType === 'NEW_CUSTOMER_OFFER_COMPLETED' && record.contactKey === contactKey)) return 'redeemed';
  const released = new Set(records.filter(record => record.recordType === 'NEW_CUSTOMER_OFFER_RELEASED').map(record => record.claimId));
  const claimed = records.some(record => record.recordType === 'NEW_CUSTOMER_OFFER_CLAIM'
    && record.contactKey === contactKey && !released.has(record.claimId) && Date.parse(record.expiresAt) > now.getTime());
  return claimed ? 'claimed' : 'available';
}

export function newCustomerOfferClaimId() {
  return randomBytes(12).toString('base64url');
}
